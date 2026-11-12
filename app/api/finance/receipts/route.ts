import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextReceiptReference } from '@/lib/auto-numbers'
import { determineInvoiceStatus } from '@/lib/calculations'
import { Prisma } from '@prisma/client'
import { money } from '@/lib/money'
import { postJournal } from '@/lib/gl-posting'
import { withIdempotency } from '@/lib/idempotency'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { toDbInvoiceStatus, isVoidStatus } from '@/lib/invoice-status'
import { checkLockDate } from '@/lib/lock-dates'
import { z } from 'zod'
import { apiError, ApiError } from '@/lib/api-error'

// Payment.status in the live DB uses Title Case ("Posted"), not the
// SCREAMING_CASE the rest of the finance code assumes elsewhere — keep new
// writes consistent with existing data.
const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank Transfer',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  MOBILE_MONEY: 'Mobile Money',
  OTHER: 'Other',
}

// IDs in this DB are opaque strings from the legacy import (24-char hex,
// not UUID-formatted) — .uuid() would reject every real record.
const receiptSchema = z.object({
  bankAccountId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  receiptDate: z.string(),
  method: z.string().optional(),
  customerId: z.string().min(1).optional(),
  invoiceId: z.string().min(1).optional(),
  notes: z.string().optional(),
  payer: z.string().optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Customer Receipts live in `payments` (payment_type = 'Customer Receipt'),
  // not the separate/unused `Receipt` model — see project memory on the
  // dual-model drift found during the 2026-07-16 Excel audit.
  const rows = await prisma.payment.findMany({
    where: { companyId: session.companyId, payment_type: 'Customer Receipt' },
    orderBy: { payment_date: 'desc' },
  })

  const bankAccountIds = Array.from(new Set(rows.map((r) => r.bank_account_id).filter(Boolean))) as string[]
  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[]
  const [banks, customers] = await Promise.all([
    bankAccountIds.length
      ? prisma.bankAccount.findMany({ where: { id: { in: bankAccountIds } }, select: { id: true, bank_name: true, account_number: true } })
      : Promise.resolve([]),
    customerIds.length
      ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, company_name: true } })
      : Promise.resolve([]),
  ])
  const bankMap = Object.fromEntries(banks.map((b) => [b.id, b]))
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]))

  const receipts = rows.map((r) => ({
    id: r.id,
    reference: r.payment_number,
    receiptDate: r.payment_date,
    payer: r.party_name,
    amount: Number(r.amount ?? 0),
    method: r.payment_method ?? 'Other',
    bankAccount: {
      bankName: r.bank_account_name ?? bankMap[r.bank_account_id ?? '']?.bank_name ?? '',
      accountNumber: bankMap[r.bank_account_id ?? '']?.account_number ?? '',
    },
    customer: r.customer_id ? { name: customerMap[r.customer_id]?.company_name ?? '' } : null,
  }))

  return NextResponse.json({ receipts })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return withIdempotency(req, session.companyId, 'POST /api/finance/receipts', async () => {
  try {
    const data = receiptSchema.parse(await req.json())

    const lockError = await checkLockDate(session.companyId, new Date(data.receiptDate))
    if (lockError) return NextResponse.json({ error: lockError, code: 'PERIOD_LOCKED' }, { status: 422 })

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, companyId: session.companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

    // Explicit Company-level account mapping replaces fuzzy account-name
    // matching -- a receipt can no longer post successfully while silently
    // never reaching the GL.
    const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { receivablesAccountId: true } })
    if (!company?.receivablesAccountId) {
      return NextResponse.json({ error: 'Accounts Receivable account is not configured. Set it in Settings → Company → Tax.' }, { status: 400 })
    }
    const arAccountRecord = await prisma.chartOfAccount.findFirst({ where: { id: company.receivablesAccountId, companyId: session.companyId } })
    if (!arAccountRecord) {
      return NextResponse.json({ error: 'The configured Accounts Receivable account no longer exists. Re-select it in Settings → Company → Tax.' }, { status: 400 })
    }

    // A receipt must reach the ledger: a bank account with no GL account used
    // to move the bank balance while silently skipping the journal.
    if (!bankAccount.chart_account_id) {
      return NextResponse.json({ error: 'The selected bank account has no linked GL account', code: 'BANK_NOT_LINKED' }, { status: 400 })
    }

    const amount = money(data.amount)
    if (!amount.gt(0)) return NextResponse.json({ error: 'Amount must be greater than zero', code: 'VALIDATION_ERROR' }, { status: 400 })

    // BUG-028: when an invoice is given, it decides the customer.
    let customerId: string | null = data.customerId ?? null
    if (data.invoiceId) {
      const inv = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: session.companyId }, select: { customer_id: true, status: true } })
      if (!inv) return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
      if (isVoidStatus(inv.status)) return NextResponse.json({ error: 'Invoice is void', code: 'INVALID_STATE' }, { status: 409 })
      if (customerId && inv.customer_id && customerId !== inv.customer_id) {
        return NextResponse.json({ error: 'The receipt customer does not match the invoice customer', code: 'CUSTOMER_MISMATCH' }, { status: 400 })
      }
      customerId = inv.customer_id
    }

    const reference = await nextReceiptReference(session.companyId)
    const methodLabel = METHOD_LABELS[data.method ?? 'OTHER'] ?? data.method ?? 'Other'
    const bankGLId = bankAccount.chart_account_id

    const receipt = await prisma.$transaction(async (tx) => {
      let updatedInvoice: unknown = null
      let newInvoiceStatus: string | undefined = undefined
      let newInvoiceBalance: number | undefined = undefined
      let invoiceNumber = ''

      if (data.invoiceId) {
        // BUG-027: lock the invoice row so concurrent receipts queue up and
        // each sees the previous one's amount_paid (two $10 receipts used to
        // raise it by $10 between them).
        const [locked] = await tx.$queryRaw<{ total_amount: Prisma.Decimal | null; amount_paid: Prisma.Decimal | null; credited_amount: Prisma.Decimal; due_date: string | null; invoice_number: string | null }[]>`
          SELECT total_amount, amount_paid, credited_amount, due_date, invoice_number FROM sales_invoices WHERE id = ${data.invoiceId} FOR UPDATE`
        const total = money(locked.total_amount)
        const paid = money(locked.amount_paid)
        // A2: applied credit notes reduce what is left to pay.
        const credited = money(locked.credited_amount)
        const owed = total.sub(paid).sub(credited)
        if (amount.gt(owed)) {
          throw new ApiError(`Receipt amount (${amount.toFixed(2)}) exceeds invoice balance due (${owed.toFixed(2)})`, 400, 'OVERPAYMENT')
        }
        const newPaid = paid.add(amount)
        newInvoiceBalance = Number(total.sub(newPaid).sub(credited))
        newInvoiceStatus = toDbInvoiceStatus(determineInvoiceStatus(Number(total), Number(newPaid.add(credited)), new Date(locked.due_date ?? Date.now())))
        invoiceNumber = locked.invoice_number ?? ''
        updatedInvoice = await tx.salesInvoice.update({ where: { id: data.invoiceId }, data: { amount_paid: newPaid, balance_due: total.sub(newPaid).sub(credited), status: newInvoiceStatus } })
      }

      const r = await tx.payment.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bank_account_id: data.bankAccountId,
          bank_account_name: bankAccount.account_name ?? '',
          payment_number: reference,
          payment_type: 'Customer Receipt',
          party_name: data.payer ?? '',
          amount,
          payment_date: data.receiptDate,
          payment_method: methodLabel,
          customer_id: customerId,
          currency: bankAccount.currency ?? 'USD',
          description: data.notes ?? '',
          allocations: data.invoiceId
            ? JSON.stringify([{ invoice_id: data.invoiceId, invoice_number: invoiceNumber, amount: Number(amount) }])
            : '[]',
          status: 'Posted',
          created_by_id: session.userId,
          created_by: session.name,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
      })

      // Atomic increment: safe under concurrent receipts to the same bank.
      await tx.bankAccount.update({ where: { id: data.bankAccountId }, data: { current_balance: { increment: amount } } })
      const refreshedBank = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { current_balance: true } })
      const newBankBalance = Number(refreshedBank?.current_balance ?? 0)

      if (customerId) await recalculateCustomerOutstandingBalance(tx, customerId)

      const journalId = await postJournal(tx, {
        companyId: session.companyId,
        reference: `JE-auto-${reference}`,
        entryDate: new Date(data.receiptDate).toISOString(),
        description: `Receipt ${reference}`,
        lines: [
          { accountId: bankGLId, debit: amount, description: 'Cash received' },
          { accountId: arAccountRecord.id, credit: amount, description: 'Invoice settled' },
        ],
        userId: session.userId,
        sourceType: 'receipt',
        sourceId: r.id,
      })
      await tx.payment.update({ where: { id: r.id }, data: { journal_entry_id: journalId } })

      return { receipt: r, newBankBalance, updatedInvoice, newInvoiceStatus, newInvoiceBalance }
    }, { timeout: 60000 })

    // Log audit with updated balances
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'RECEIPT',
      recordId: receipt.receipt.id,
      newValues: {
        reference,
        amount: data.amount,
        updatedBankBalance: receipt.newBankBalance,
        updatedInvoiceStatus: receipt.newInvoiceStatus,
        updatedInvoiceBalance: receipt.newInvoiceBalance,
      },
    })

    return NextResponse.json({
      receipt: { ...receipt.receipt, reference: receipt.receipt.payment_number },
      updatedBankBalance: receipt.newBankBalance,
      updatedInvoiceStatus: receipt.newInvoiceStatus,
      updatedInvoiceBalance: receipt.newInvoiceBalance,
    }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
  })
}
