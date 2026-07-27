import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextReceiptReference } from '@/lib/auto-numbers'
import {
  determineInvoiceStatus,
  calculateBalanceDue,
  round2dp,
} from '@/lib/calculations'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { toDbInvoiceStatus } from '@/lib/invoice-status'
import { checkLockDate } from '@/lib/lock-dates'
import { z } from 'zod'

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

  try {
    const data = receiptSchema.parse(await req.json())

    const lockError = await checkLockDate(session.companyId, new Date(data.receiptDate))
    if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })

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

    // If invoice provided, validate it belongs to company and does not exceed balance
    let invoice: any = null
    if (data.invoiceId) {
      invoice = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: session.companyId } })
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (invoice.status === 'Paid') return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 })
      if (Number(data.amount) > Number(invoice.balance_due ?? 0)) {
        return NextResponse.json({ error: `Receipt amount (${round2dp(data.amount)}) exceeds invoice balance due (${round2dp(Number(invoice.balance_due ?? 0))})` }, { status: 400 })
      }
    }

    const reference = await nextReceiptReference(session.companyId)
    const methodLabel = METHOD_LABELS[data.method ?? 'OTHER'] ?? data.method ?? 'Other'

    const receipt = await prisma.$transaction(async (tx) => {
      // STEP a: create the receipt as a Payment record (payment_type =
      // 'Customer Receipt') — this is where the real, reported data lives.
      const r = await tx.payment.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bank_account_id: data.bankAccountId,
          bank_account_name: bankAccount.account_name ?? '',
          payment_number: reference,
          payment_type: 'Customer Receipt',
          party_name: data.payer ?? '',
          amount: data.amount,
          payment_date: data.receiptDate,
          payment_method: methodLabel,
          customer_id: data.customerId ?? null,
          currency: bankAccount.currency ?? 'USD',
          description: data.notes ?? '',
          allocations: data.invoiceId
            ? JSON.stringify([{ invoice_id: data.invoiceId, invoice_number: invoice?.invoice_number ?? '', amount: data.amount }])
            : '[]',
          status: 'Posted',
          created_by_id: session.userId,
          created_by: session.name,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
      })

      // STEP b: update bank account currentBalance via an atomic increment —
      // safe under concurrent receipts against the same account, unlike a
      // read-then-write of an absolute value.
      await tx.bankAccount.update({ where: { id: data.bankAccountId }, data: { current_balance: { increment: data.amount } } })
      const refreshedBank = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { current_balance: true } })
      const newBankBalance = Number(refreshedBank?.current_balance ?? 0)

      let updatedInvoice: any = null
      let newInvoiceStatus: string | undefined = undefined
      let newInvoiceBalance: number | undefined = undefined

      // STEP c: if linked invoice, update paidAmount, balanceDue, status
      if (data.invoiceId && invoice) {
        const newPaidAmount = round2dp(Number(invoice.amount_paid ?? 0) + Number(data.amount))
        newInvoiceBalance = calculateBalanceDue(Number(invoice.total_amount ?? 0), newPaidAmount)
        const rawStatus = determineInvoiceStatus(Number(invoice.total_amount ?? 0), newPaidAmount, new Date(invoice.due_date ?? Date.now()))
        newInvoiceStatus = toDbInvoiceStatus(rawStatus)
        updatedInvoice = await tx.salesInvoice.update({ where: { id: data.invoiceId }, data: { amount_paid: newPaidAmount, balance_due: newInvoiceBalance, status: newInvoiceStatus } })
      }

      // STEP d: recalculate customer outstanding balance from all non-VOID invoices
      if (data.customerId || (invoice && invoice.customer_id)) {
        const customerId = data.customerId ?? invoice.customer_id
        await recalculateCustomerOutstandingBalance(tx, customerId)
      }

      // STEP e: Create Journal Entry (auto-POSTED) and update GL balances.
      // arAccountRecord was resolved from the explicit Company mapping
      // before the transaction opened -- no fuzzy name matching here.
      const bankLedger = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { chart_account_id: true } }).catch(() => null)

      if (bankLedger?.chart_account_id) {
        const bankGLId = bankLedger.chart_account_id
        const je = await tx.journalEntry.create({
          data: {
            id: crypto.randomUUID(),
            companyId: session.companyId,
            reference: `JE-auto-${reference}`,
            entry_date: new Date(data.receiptDate).toISOString(),
            description: `Receipt ${reference}`,
            total_debit: data.amount,
            total_credit: data.amount,
            status: 'POSTED',
            created_by_id: session.userId,
          },
        })

        await tx.journalLine.createMany({
          data: [
            {
              id: crypto.randomUUID(),
              journalEntryId: je.id,
              accountId: bankGLId,
              description: 'Cash received',
              debit: data.amount,
              credit: 0,
            },
            {
              id: crypto.randomUUID(),
              journalEntryId: je.id,
              accountId: arAccountRecord.id,
              description: 'Invoice settled',
              debit: 0,
              credit: data.amount,
            },
          ],
        })

        // Update account balances
        await tx.chartOfAccount.update({ where: { id: bankGLId }, data: { current_balance: { increment: data.amount } } })
        await tx.chartOfAccount.update({ where: { id: arAccountRecord.id }, data: { current_balance: { decrement: data.amount } } })
      }

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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
