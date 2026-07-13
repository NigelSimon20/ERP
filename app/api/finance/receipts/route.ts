import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextReceiptReference } from '@/lib/auto-numbers'
import {
  determineInvoiceStatus,
  calculateNewBankBalance,
  calculateBalanceDue,
  calculateCustomerOutstandingBalance,
  round2dp,
} from '@/lib/calculations'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { z } from 'zod'

const receiptSchema = z.object({
  bankAccountId: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  receiptDate: z.string(),
  customerId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
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

  const receipts = await prisma.receipt.findMany({
    where: { companyId: session.companyId },
    orderBy: { receiptDate: 'desc' },
  })
  return NextResponse.json({ receipts })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = receiptSchema.parse(await req.json())

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: data.bankAccountId, companyId: session.companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

    // If invoice provided, validate it belongs to company and does not exceed balance
    let invoice: any = null
    if (data.invoiceId) {
      invoice = await prisma.salesInvoice.findFirst({ where: { id: data.invoiceId, companyId: session.companyId } })
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if ((invoice.status as string) === 'PAID') return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 })
      if (Number(data.amount) > Number(invoice.balance_due ?? 0)) {
        return NextResponse.json({ error: `Receipt amount (${round2dp(data.amount)}) exceeds invoice balance due (${round2dp(Number(invoice.balanceDue))})` }, { status: 400 })
      }
    }

    const reference = await nextReceiptReference(session.companyId)

    const receipt = await prisma.$transaction(async (tx) => {
      // STEP a: create receipt record
      const r = await tx.receipt.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bankAccountId: data.bankAccountId,
          reference,
          amount: data.amount,
          receiptDate: new Date(data.receiptDate),
          customerId: data.customerId ?? '',
          invoiceId: data.invoiceId ?? null,
          notes: data.notes ?? '',
        },
      })

      // STEP b: update bank account currentBalance to new running total
      const newBankBalance = calculateNewBankBalance(Number(bankAccount.current_balance ?? 0), data.amount, 'IN')
      await tx.bankAccount.update({ where: { id: data.bankAccountId }, data: { current_balance: newBankBalance } })

      let updatedInvoice: any = null
      let newInvoiceStatus: string | undefined = undefined
      let newInvoiceBalance: number | undefined = undefined

      // STEP c: if linked invoice, update paidAmount, balanceDue, status
      if (data.invoiceId && invoice) {
        const newPaidAmount = round2dp(Number(invoice.paidAmount ?? invoice.amount_paid ?? 0) + Number(data.amount))
        newInvoiceBalance = calculateBalanceDue(Number(invoice.totalAmount ?? invoice.total_amount ?? 0), newPaidAmount)
        newInvoiceStatus = determineInvoiceStatus(Number(invoice.totalAmount ?? invoice.total_amount ?? 0), newPaidAmount, new Date(invoice.dueDate ?? invoice.due_date ?? invoice.due_date))
        updatedInvoice = await tx.salesInvoice.update({ where: { id: data.invoiceId }, data: { amount_paid: newPaidAmount, balance_due: newInvoiceBalance, status: newInvoiceStatus } })
      }

      // STEP d: recalculate customer outstanding balance from all non-VOID invoices
      if (data.customerId || (invoice && invoice.customer_id)) {
        const customerId = data.customerId ?? invoice.customer_id
        await recalculateCustomerOutstandingBalance(tx, customerId)
      }

      // STEP e: Create Journal Entry (auto-POSTED) and update GL balances
      const bankLedger = await tx.bankAccount.findUnique({ where: { id: data.bankAccountId }, select: { chart_account_id: true } }).catch(() => null)
      const arAccount = await tx.chartOfAccount.findFirst({ where: { account_type: 'ASSET', account_name: { contains: 'Receivable' }, companyId: session.companyId }, select: { id: true } }).catch(() => null)

      if (bankLedger?.chart_account_id && arAccount) {
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
              accountId: arAccount.id,
              description: 'Invoice settled',
              debit: 0,
              credit: data.amount,
            },
          ],
        })

        // Update account balances
        await tx.chartOfAccount.update({ where: { id: bankGLId }, data: { current_balance: { increment: data.amount } } })
        await tx.chartOfAccount.update({ where: { id: arAccount.id }, data: { current_balance: { decrement: data.amount } } })
      }

      return { receipt: r, newBankBalance, updatedInvoice, newInvoiceStatus, newInvoiceBalance }
    })

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
      receipt: receipt.receipt,
      updatedBankBalance: receipt.newBankBalance,
      updatedInvoiceStatus: receipt.newInvoiceStatus,
      updatedInvoiceBalance: receipt.newInvoiceBalance,
    }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
