import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientSession } from '@/lib/portal-auth'
import { deriveInvoiceStatus, DB_STATUS_VOID } from '@/lib/invoice-status'

export async function GET() {
  const session = await getClientSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.customerId) return NextResponse.json({ invoices: [] })

  const invoices = await prisma.salesInvoice.findMany({
    where: { companyId: session.companyId, customer_id: session.customerId },
    orderBy: { invoice_date: 'desc' },
    select: {
      id: true,
      invoice_number: true,
      invoice_date: true,
      due_date: true,
      total_amount: true,
      amount_paid: true,
      balance_due: true,
      status: true,
    },
  })

  return NextResponse.json({
    invoices: invoices.map(i => ({
      id: i.id,
      invoiceNumber: i.invoice_number ?? '',
      issueDate: i.invoice_date ?? '',
      dueDate: i.due_date ?? '',
      totalAmount: Number(i.total_amount ?? 0),
      paidAmount: Number(i.amount_paid ?? 0),
      balanceDue: Number(i.balance_due ?? 0),
      // Same derived UPPERCASE status as the finance API (BUG-033).
      status: deriveInvoiceStatus({ total: i.total_amount, paid: i.amount_paid, dueDate: i.due_date, voided: i.status === DB_STATUS_VOID }),
    })),
  })
}
