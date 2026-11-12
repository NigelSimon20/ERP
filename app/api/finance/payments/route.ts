import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextPaymentReference } from '@/lib/auto-numbers'
import {
  determineInvoiceStatus,
  calculateBalanceDue,
  round2dp,
} from '@/lib/calculations'
import { recalculateSupplierOutstandingBalance } from '@/lib/finance-recalculation'
import { checkLockDate } from '@/lib/lock-dates'
import { postJournal } from '@/lib/gl-posting'
import { autoJournalReference } from '@/lib/journal-rules'
import { ensureSupplierAdvancesAccount } from '@/lib/supplier-advances'
import { z } from 'zod'
import { apiError, ApiError } from '@/lib/api-error'

const paymentSchema = z.object({
  bankAccountId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paymentDate: z.string(),
  method: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().min(1).optional(),
  notes: z.string().optional(),
  payee: z.string().optional(),
  expenseAccountId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
})

// A1: what a payment can pay for, and the payment_type label each is stored
// under (labels match the ones the live data already uses).
const PAYMENT_TYPES = ['PURCHASE_INVOICE', 'EXPENSE', 'SUPPLIER_ADVANCE'] as const
const PAYMENT_TYPE_LABELS: Record<(typeof PAYMENT_TYPES)[number], string> = {
  PURCHASE_INVOICE: 'Supplier Payment',
  EXPENSE: 'Expense Payment',
  SUPPLIER_ADVANCE: 'Supplier Advance',
}

// Mirrors app/api/finance/receipts/route.ts — keep new payment_method writes
// consistent with the humanized labels the live DB already uses.
const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  MOBILE_MONEY: 'Mobile Money',
  OTHER: 'Other',
}

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Outgoing payments live in `payments` with payment_type in ('Supplier Payment',
  // 'Other Payment', 'Expense Payment') — 'Customer Receipt' rows belong to the
  // Receipts page, see the same dual-model note in app/api/finance/receipts/route.ts.
  const rows = await prisma.payment.findMany({
    where: { companyId: session.companyId, payment_type: { in: ['Supplier Payment', 'Other Payment', 'Expense Payment', 'Supplier Advance'] } },
    orderBy: { payment_date: 'desc' },
  })

  const bankAccountIds = Array.from(new Set(rows.map((r) => r.bank_account_id).filter(Boolean))) as string[]
  const banks = bankAccountIds.length
    ? await prisma.bankAccount.findMany({ where: { id: { in: bankAccountIds } }, select: { id: true, bank_name: true, account_number: true } })
    : []
  const bankMap = Object.fromEntries(banks.map((b) => [b.id, b]))

  const payments = rows.map((r) => ({
    id: r.id,
    reference: r.payment_number,
    paymentDate: r.payment_date,
    payee: r.party_name,
    amount: Number(r.amount ?? 0),
    method: r.payment_method ?? 'Other',
    notes: r.description,
    bankAccount: {
      bankName: r.bank_account_name ?? bankMap[r.bank_account_id ?? '']?.bank_name ?? '',
      accountNumber: bankMap[r.bank_account_id ?? '']?.account_number ?? '',
    },
  }))

  return NextResponse.json({ payments })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = paymentSchema.parse(await req.json())

    // A1: a payment must say what it pays for. An untyped payment used to post
    // Dr AP / Cr bank without reducing any bill, so AP drifted from what
    // suppliers were actually owed.
    const entityType = PAYMENT_TYPES.find((t) => t === data.entityType)
    if (!entityType) {
      return NextResponse.json({ error: 'Choose what this payment is for: a supplier bill, a direct expense or a supplier advance.', code: 'PAYMENT_TYPE_REQUIRED' }, { status: 400 })
    }
    if (entityType === 'PURCHASE_INVOICE' && !data.entityId) return NextResponse.json({ error: 'Select the bill being paid', code: 'VALIDATION_ERROR' }, { status: 400 })
    if (entityType === 'EXPENSE' && !data.expenseAccountId) return NextResponse.json({ error: 'Expense account is required', code: 'VALIDATION_ERROR' }, { status: 400 })
    if (entityType === 'SUPPLIER_ADVANCE' && !data.supplierId) return NextResponse.json({ error: 'Select the supplier receiving the advance', code: 'VALIDATION_ERROR' }, { status: 400 })

    const lockError = await checkLockDate(session.companyId, new Date(data.paymentDate))
    if (lockError) return NextResponse.json({ error: lockError, code: 'PERIOD_LOCKED' }, { status: 422 })

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, companyId: session.companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Bank account not found', code: 'NOT_FOUND' }, { status: 404 })
    // Every payment gets a journal; one into a bank with no GL account would
    // move the bank balance and never reach the ledger.
    if (!bankAccount.chart_account_id) return NextResponse.json({ error: 'The selected bank account has no linked GL account', code: 'BANK_NOT_LINKED' }, { status: 400 })

    // ensure sufficient funds
    const currentBank = Number(bankAccount.current_balance ?? 0)
    if (currentBank < Number(data.amount)) return NextResponse.json({ error: `Insufficient bank funds (${round2dp(currentBank)})`, code: 'INSUFFICIENT_FUNDS' }, { status: 400 })

    // If purchase invoice provided, validate
    let invoice: any = null
    if (entityType === 'PURCHASE_INVOICE') {
      invoice = await prisma.purchaseInvoice.findFirst({ where: { id: data.entityId, companyId: session.companyId } })
      if (!invoice) return NextResponse.json({ error: 'Purchase invoice not found', code: 'NOT_FOUND' }, { status: 404 })
      if ((invoice.status as string) === 'PAID') return NextResponse.json({ error: 'Invoice already paid', code: 'ALREADY_PAID' }, { status: 400 })
      if (Number(data.amount) > Number(invoice.balanceDue ?? invoice.balance_due ?? invoice.totalAmount)) {
        return NextResponse.json({ error: `Payment amount (${round2dp(data.amount)}) exceeds invoice balance due (${round2dp(Number(invoice.balanceDue ?? invoice.balance_due ?? invoice.totalAmount))})`, code: 'OVERPAYMENT' }, { status: 400 })
      }
    }

    let supplier: { id: string; company_name: string | null } | null = null
    if (entityType === 'SUPPLIER_ADVANCE') {
      supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, companyId: session.companyId }, select: { id: true, company_name: true } })
      if (!supplier) return NextResponse.json({ error: 'Supplier not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // A direct expense (not tied to a Purchase Invoice / AP) must be booked
    // against a real expense account, not the AP control account.
    let expenseAccount: any = null
    let apAccountId: string | null = null
    if (entityType === 'EXPENSE') {
      expenseAccount = await prisma.chartOfAccount.findFirst({ where: { id: data.expenseAccountId, companyId: session.companyId, account_type: 'EXPENSE' } })
      if (!expenseAccount) return NextResponse.json({ error: 'Expense account not found', code: 'NOT_FOUND' }, { status: 404 })
    } else if (entityType === 'PURCHASE_INVOICE') {
      // AP settlement -- explicit Company-level mapping replaces fuzzy
      // account-name matching.
      const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { payablesAccountId: true } })
      if (!company?.payablesAccountId) {
        return NextResponse.json({ error: 'Accounts Payable account is not configured. Set it in Settings → Company → Tax.', code: 'ACCOUNT_NOT_CONFIGURED' }, { status: 400 })
      }
      const apAccount = await prisma.chartOfAccount.findFirst({ where: { id: company.payablesAccountId, companyId: session.companyId } })
      if (!apAccount) {
        return NextResponse.json({ error: 'The configured Accounts Payable account no longer exists. Re-select it in Settings → Company → Tax.', code: 'ACCOUNT_NOT_CONFIGURED' }, { status: 400 })
      }
      apAccountId = apAccount.id
    }

    const reference = await nextPaymentReference(session.companyId)
    const methodLabel = METHOD_LABELS[data.method ?? 'OTHER'] ?? data.method ?? 'Other'
    const bankGLId = bankAccount.chart_account_id

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bank_account_id: data.bankAccountId,
          bank_account_name: bankAccount.account_name ?? '',
          payment_number: reference,
          amount: data.amount,
          payment_date: new Date(data.paymentDate).toISOString(),
          payment_method: methodLabel,
          payment_type: PAYMENT_TYPE_LABELS[entityType],
          description: data.notes ?? '',
          party_name: data.payee || supplier?.company_name || '',
          supplier_id: entityType === 'PURCHASE_INVOICE' ? invoice?.supplierId ?? null : entityType === 'SUPPLIER_ADVANCE' ? supplier!.id : null,
          currency: bankAccount.currency ?? 'USD',
          status: 'Posted',
          created_by_id: session.userId,
          created_by: session.name,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
      })

      // Atomic, guarded decrement — Postgres evaluates the WHERE against the
      // live row in the same statement, so this is safe under concurrent
      // payments against the same account (no lost update, no TOCTOU
      // overdraft) unlike a read-then-write of an absolute value.
      const decremented = await tx.bankAccount.updateMany({
        where: { id: data.bankAccountId, current_balance: { gte: data.amount } },
        data: { current_balance: { decrement: data.amount } },
      })
      if (decremented.count === 0) throw new ApiError('Insufficient bank funds', 400, 'INSUFFICIENT_FUNDS')
      const refreshedBank = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { current_balance: true } })
      const newBankBalance = Number(refreshedBank?.current_balance ?? 0)

      let updatedInvoice: any = null
      let newInvoiceBalance: number | undefined = undefined
      let newInvoiceStatus: string | undefined = undefined

      // if linked purchase invoice, update paid/balance/status and supplier outstanding
      if (entityType === 'PURCHASE_INVOICE' && invoice) {
        const newPaidAmount = round2dp(Number(invoice.paidAmount ?? invoice.paid_amount ?? 0) + Number(data.amount))
        newInvoiceBalance = calculateBalanceDue(Number(invoice.totalAmount ?? invoice.total_amount ?? 0), newPaidAmount)
        newInvoiceStatus = determineInvoiceStatus(Number(invoice.totalAmount ?? invoice.total_amount ?? 0), newPaidAmount, new Date(invoice.dueDate ?? invoice.due_date ?? invoice.due_date))
        updatedInvoice = await tx.purchaseInvoice.update({ where: { id: data.entityId }, data: { paidAmount: newPaidAmount, balanceDue: newInvoiceBalance, status: newInvoiceStatus as any } })

        // recalc supplier outstanding from AP invoices
        await recalculateSupplierOutstandingBalance(tx, invoice.supplierId, session.companyId)
      }

      // Dr what was paid for / Cr the bank, through the validated posting path.
      const [debitAccountId, debitDescription] =
        entityType === 'EXPENSE' ? [expenseAccount.id as string, `Expense — ${data.notes || data.payee || 'Direct expense'}`]
        : entityType === 'SUPPLIER_ADVANCE' ? [await ensureSupplierAdvancesAccount(tx, session.companyId), `Advance to ${supplier!.company_name ?? 'supplier'}`]
        : [apAccountId!, 'AP settlement']
      const journalEntryId = await postJournal(tx, {
        companyId: session.companyId,
        reference: autoJournalReference('PAY', reference),
        entryDate: new Date(data.paymentDate).toISOString(),
        description: `Payment ${reference} to ${data.payee || supplier?.company_name || ''}`,
        lines: [
          { accountId: debitAccountId, debit: data.amount, description: debitDescription },
          { accountId: bankGLId, credit: data.amount, description: 'Bank payment' },
        ],
        userId: session.userId,
        sourceType: 'payment',
        sourceId: p.id,
      })
      const linked = await tx.payment.update({ where: { id: p.id }, data: { journal_entry_id: journalEntryId } })

      return { payment: linked, newBankBalance, updatedInvoice, newInvoiceBalance, newInvoiceStatus }
    }, { timeout: 60000 })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'PAYMENT',
      recordId: payment.payment.id,
      newValues: { reference, entityType, amount: data.amount, updatedBankBalance: payment.newBankBalance, updatedInvoiceBalance: payment.newInvoiceBalance },
    })

    return NextResponse.json({ payment: { ...payment.payment, reference: payment.payment.payment_number }, updatedBankBalance: payment.newBankBalance, updatedInvoiceBalance: payment.newInvoiceBalance, updatedInvoiceStatus: payment.newInvoiceStatus }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
