import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session

  const [customer, invoices, receipts, sites] = await Promise.all([
    prisma.customer.findFirst({ where: { id: params.id } }),
    prisma.salesInvoice.findMany({
      where: { customer_id: params.id },
      orderBy: { invoice_date: 'desc' },
      select: { id: true, invoice_number: true, invoice_date: true, due_date: true, total_amount: true, amount_paid: true, balance_due: true, status: true },
    }),
    prisma.receipt.findMany({
      where: { customerId: params.id },
      orderBy: { receiptDate: 'desc' },
      select: { id: true, reference: true, receiptDate: true, amount: true },
    }),
    prisma.site.findMany({
      where: { customer_id: params.id },
      select: { id: true, site_name: true, status: true, contract_end_date: true },
    }),
  ])

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const outstandingBalance = invoices.reduce((s, i) => s + Number(i.balance_due), 0)

  return NextResponse.json({ customer, invoices, receipts, sites, outstandingBalance })
}
