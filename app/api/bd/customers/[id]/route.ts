import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session

  const customer = await prisma.customer.findFirst({ where: { id: params.id, companyId } })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [invoices, receipts, sites] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { customer_id: params.id },
      orderBy: { invoice_date: 'desc' },
      select: { id: true, invoice_number: true, invoice_date: true, due_date: true, total_amount: true, amount_paid: true, balance_due: true, status: true },
    }),
    prisma.payment.findMany({
      where: { customer_id: params.id, payment_type: 'Customer Receipt' },
      orderBy: { payment_date: 'desc' },
      select: { id: true, payment_number: true, payment_date: true, amount: true, payment_method: true },
    }),
    prisma.site.findMany({
      where: { customer_id: params.id },
      select: { id: true, site_name: true, status: true, contract_end_date: true },
    }),
  ])

  const outstandingBalance = invoices.reduce((s, i) => s + Number(i.balance_due), 0)

  const mappedCustomer = {
    id: customer.id,
    name: customer.company_name,
    email: customer.email,
    phone: customer.phone,
    contactPerson: customer.contact_person,
    address: customer.billing_address,
    paymentTerms: customer.payment_terms ?? 0,
    creditLimit: customer.credit_limit ?? 0,
  }

  const mappedInvoices = invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    issueDate: i.invoice_date,
    dueDate: i.due_date,
    totalAmount: Number(i.total_amount ?? 0),
    paidAmount: Number(i.amount_paid ?? 0),
    balanceDue: Number(i.balance_due ?? 0),
    status: i.status,
  }))

  const mappedReceipts = receipts.map((r) => ({
    id: r.id,
    reference: r.payment_number,
    date: r.payment_date,
    amount: Number(r.amount ?? 0),
    paymentMethod: r.payment_method,
  }))

  const mappedSites = sites.map((s) => ({
    id: s.id,
    name: s.site_name,
    status: s.status,
    contractEnd: s.contract_end_date,
    contractValue: null as number | null,
  }))

  return NextResponse.json({ customer: mappedCustomer, invoices: mappedInvoices, receipts: mappedReceipts, sites: mappedSites, outstandingBalance })
}
