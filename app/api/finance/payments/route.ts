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
  calculateSupplierOutstandingBalance,
  round2dp,
} from '@/lib/calculations'
import { recalculateSupplierOutstandingBalance } from '@/lib/finance-recalculation'
import { checkLockDate } from '@/lib/lock-dates'
import { applyBalanceDeltas } from '@/lib/gl-posting'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'

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
})

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
    where: { companyId: session.companyId, payment_type: { in: ['Supplier Payment', 'Other Payment', 'Expense Payment'] } },
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

    const lockError = await checkLockDate(session.companyId, new Date(data.paymentDate))
    if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, companyId: session.companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

    // ensure sufficient funds
    const currentBank = Number(bankAccount.current_balance ?? 0)
    if (currentBank < Number(data.amount)) return NextResponse.json({ error: `Insufficient bank funds (${round2dp(currentBank)})` }, { status: 400 })

    // If purchase invoice provided, validate
    let invoice: any = null
    if (data.entityType === 'PURCHASE_INVOICE' && data.entityId) {
      invoice = await prisma.purchaseInvoice.findFirst({ where: { id: data.entityId, companyId: session.companyId } })
      if (!invoice) return NextResponse.json({ error: 'Purchase invoice not found' }, { status: 404 })
      if ((invoice.status as string) === 'PAID') return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 })
      if (Number(data.amount) > Number(invoice.balanceDue ?? invoice.balance_due ?? invoice.totalAmount)) {
        return NextResponse.json({ error: `Payment amount (${round2dp(data.amount)}) exceeds invoice balance due (${round2dp(Number(invoice.balanceDue ?? invoice.balance_due ?? invoice.totalAmount))})` }, { status: 400 })
      }
    }

    // A direct expense (not tied to a Purchase Invoice / AP) must be booked
    // against a real expense account, not the AP control account — see the
    // GL-posting fix below.
    let expenseAccount: any = null
    let apAccountId: string | null = null
    if (data.entityType === 'EXPENSE') {
      if (!data.expenseAccountId) return NextResponse.json({ error: 'Expense account is required' }, { status: 400 })
      expenseAccount = await prisma.chartOfAccount.findFirst({ where: { id: data.expenseAccountId, companyId: session.companyId, account_type: 'EXPENSE' } })
      if (!expenseAccount) return NextResponse.json({ error: 'Expense account not found' }, { status: 404 })
    } else {
      // AP settlement (supplier payment or general payment) -- explicit
      // Company-level mapping replaces fuzzy account-name matching.
      const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { payablesAccountId: true } })
      if (!company?.payablesAccountId) {
        return NextResponse.json({ error: 'Accounts Payable account is not configured. Set it in Settings → Company → Tax.' }, { status: 400 })
      }
      const apAccount = await prisma.chartOfAccount.findFirst({ where: { id: company.payablesAccountId, companyId: session.companyId } })
      if (!apAccount) {
        return NextResponse.json({ error: 'The configured Accounts Payable account no longer exists. Re-select it in Settings → Company → Tax.' }, { status: 400 })
      }
      apAccountId = apAccount.id
    }

    const reference = await nextPaymentReference(session.companyId)
    const methodLabel = METHOD_LABELS[data.method ?? 'OTHER'] ?? data.method ?? 'Other'

    const payment = await prisma.$transaction(async (tx) => {
      // create payment
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
          payment_type: data.entityType === 'PURCHASE_INVOICE' ? 'Supplier Payment' : data.entityType === 'EXPENSE' ? 'Expense Payment' : 'Other Payment',
          description: data.notes ?? '',
          party_name: data.payee ?? '',
          supplier_id: data.entityType === 'PURCHASE_INVOICE' ? invoice?.supplierId ?? null : null,
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
      if (decremented.count === 0) throw new Error('Insufficient bank funds')
      const refreshedBank = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { current_balance: true } })
      const newBankBalance = Number(refreshedBank?.current_balance ?? 0)

      let updatedInvoice: any = null
      let newInvoiceBalance: number | undefined = undefined
      let newInvoiceStatus: string | undefined = undefined

      // if linked purchase invoice, update paid/balance/status and supplier outstanding
      if (data.entityType === 'PURCHASE_INVOICE' && invoice) {
        const newPaidAmount = round2dp(Number(invoice.paidAmount ?? invoice.paid_amount ?? 0) + Number(data.amount))
        newInvoiceBalance = calculateBalanceDue(Number(invoice.totalAmount ?? invoice.total_amount ?? 0), newPaidAmount)
        newInvoiceStatus = determineInvoiceStatus(Number(invoice.totalAmount ?? invoice.total_amount ?? 0), newPaidAmount, new Date(invoice.dueDate ?? invoice.due_date ?? invoice.due_date))
        updatedInvoice = await tx.purchaseInvoice.update({ where: { id: data.entityId }, data: { paidAmount: newPaidAmount, balanceDue: newInvoiceBalance, status: newInvoiceStatus as any } }).catch(async () => {
          return tx.purchaseInvoice.update({ where: { id: data.entityId }, data: { paidAmount: newPaidAmount, balanceDue: newInvoiceBalance, status: newInvoiceStatus as any } })
        })

        // recalc supplier outstanding from AP invoices
        const supplierId = invoice.supplierId
        await recalculateSupplierOutstandingBalance(tx, supplierId, session.companyId)
      }

      // create posted journal entry and update GL
      const bankLedger = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { chart_account_id: true } }).catch(() => null)
      // A direct expense debits the chosen expense account, not AP — booking
      // it against Accounts Payable would falsely imply the amount was ever
      // a recorded payable, which for an ad-hoc expense it never was.
      const isExpense = data.entityType === 'EXPENSE'
      const debitAccountId = isExpense ? expenseAccount.id : apAccountId
      const debitDescription = isExpense ? `Expense — ${data.notes || data.payee || 'Direct expense'}` : 'AP settlement'

      if (bankLedger?.chart_account_id && debitAccountId) {
        const bankGLId = bankLedger.chart_account_id
        const je = await tx.journalEntry.create({
          data: {
            id: crypto.randomUUID(),
            companyId: session.companyId,
            reference: `JE-auto-${reference}`,
            entry_date: new Date(data.paymentDate).toISOString(),
            description: `Payment ${reference} to ${data.payee ?? ''}`,
            total_debit: data.amount,
            total_credit: data.amount,
            status: 'POSTED',
            created_by_id: session.userId,
          },
        })

        const lines = [
          { accountId: debitAccountId, debit: data.amount, credit: 0, description: debitDescription },
          { accountId: bankGLId, debit: 0, credit: data.amount, description: 'Bank payment' },
        ]

        await tx.journalLine.createMany({
          data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: je.id, ...l })),
        })

        // Correct normal-debit/normal-credit balance handling for whichever
        // account type was actually debited (EXPENSE is normal-debit, so it
        // must increment on a debit — a blind decrement, correct only for
        // the AP/Bank pair, would silently understate expenses).
        await applyBalanceDeltas(tx, lines)
      }

      return { payment: p, newBankBalance, updatedInvoice, newInvoiceBalance, newInvoiceStatus }
    }, { timeout: 60000 })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'PAYMENT',
      recordId: payment.payment.id,
      newValues: { reference, amount: data.amount, updatedBankBalance: payment.newBankBalance, updatedInvoiceBalance: payment.newInvoiceBalance },
    })

    return NextResponse.json({ payment: { ...payment.payment, reference: payment.payment.payment_number }, updatedBankBalance: payment.newBankBalance, updatedInvoiceBalance: payment.newInvoiceBalance, updatedInvoiceStatus: payment.newInvoiceStatus }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
