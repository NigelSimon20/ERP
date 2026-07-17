import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextPaymentReference } from '@/lib/auto-numbers'
import {
  determineInvoiceStatus,
  calculateNewBankBalance,
  calculateBalanceDue,
  calculateSupplierOutstandingBalance,
  round2dp,
} from '@/lib/calculations'
import { recalculateSupplierOutstandingBalance } from '@/lib/finance-recalculation'
import { z } from 'zod'

const paymentSchema = z.object({
  bankAccountId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paymentDate: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().min(1).optional(),
  notes: z.string().optional(),
  payee: z.string().optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payments = await prisma.payment.findMany({
    where: { companyId: session.companyId },
    orderBy: { payment_date: 'desc' },
  })

  return NextResponse.json({ payments })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = paymentSchema.parse(await req.json())

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

    const reference = await nextPaymentReference(session.companyId)

    const payment = await prisma.$transaction(async (tx) => {
      // create payment
      const p = await tx.payment.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bank_account_id: data.bankAccountId,
          reference,
          amount: data.amount,
          payment_date: new Date(data.paymentDate).toISOString(),
          payment_type: data.entityType ?? '',
          description: data.notes ?? '',
          party_name: data.payee ?? '',
        },
      })

      // update bank balance
      const newBankBalance = calculateNewBankBalance(currentBank, data.amount, 'OUT')
      await tx.bankAccount.update({ where: { id: data.bankAccountId }, data: { current_balance: newBankBalance } })

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
      const apAccount = await tx.chartOfAccount.findFirst({ where: { account_type: 'LIABILITY', account_name: { contains: 'Payable' }, companyId: session.companyId }, select: { id: true } }).catch(() => null)
      if (bankLedger?.chart_account_id && apAccount) {
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

        await tx.journalLine.createMany({
          data: [
            {
              id: crypto.randomUUID(),
              journalEntryId: je.id,
              accountId: apAccount.id,
              description: 'AP settlement',
              debit: data.amount,
              credit: 0,
            },
            {
              id: crypto.randomUUID(),
              journalEntryId: je.id,
              accountId: bankGLId,
              description: 'Bank payment',
              debit: 0,
              credit: data.amount,
            },
          ],
        })

        // update chart account balances
        await tx.chartOfAccount.update({ where: { id: apAccount.id }, data: { current_balance: { decrement: data.amount } } })
        await tx.chartOfAccount.update({ where: { id: bankGLId }, data: { current_balance: { decrement: data.amount } } })
      }

      return { payment: p, newBankBalance, updatedInvoice, newInvoiceBalance, newInvoiceStatus }
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'PAYMENT',
      recordId: payment.payment.id,
      newValues: { reference, amount: data.amount, updatedBankBalance: payment.newBankBalance, updatedInvoiceBalance: payment.newInvoiceBalance },
    })

    return NextResponse.json({ payment: payment.payment, updatedBankBalance: payment.newBankBalance, updatedInvoiceBalance: payment.newInvoiceBalance, updatedInvoiceStatus: payment.newInvoiceStatus }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
