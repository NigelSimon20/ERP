import { NextRequest, NextResponse } from 'next/server'
import { NOT_VOID } from '@/lib/invoice-status'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const search = new URL(req.url).searchParams.get('search')

  const customers = await prisma.customer.findMany({
    where: {
      companyId,
      ...(search ? { OR: [{ company_name: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {}),
    },
    orderBy: { company_name: 'asc' },
  })

  // Compute outstanding balance per customer
  const customerIds = customers.map((c) => c.id)
  const balances = await prisma.salesInvoice.groupBy({
    by: ['customer_id'],
    where: { customer_id: { in: customerIds }, status: NOT_VOID },
    _sum: { balance_due: true },
  })
  const balanceMap = Object.fromEntries(balances.map((b) => [b.customer_id, Number(b._sum.balance_due ?? 0)]))

  const result = customers.map((c) => ({
    id: c.id,
    name: c.company_name,
    email: c.email,
    phone: c.phone,
    contactPerson: c.contact_person,
    address: c.billing_address,
    paymentTerms: c.payment_terms ?? 0,
    creditLimit: c.credit_limit ?? 0,
    outstandingBalance: balanceMap[c.id] ?? 0,
  }))
  return NextResponse.json({ customers: result })
}

export async function PUT(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { id, name, email, phone, address, contactPerson, paymentTerms, creditLimit } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const existing = await prisma.customer.findFirst({ where: { id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(name ? { company_name: name } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(address !== undefined ? { billing_address: address || null } : {}),
      ...(contactPerson !== undefined ? { contact_person: contactPerson || null } : {}),
      ...(paymentTerms != null ? { payment_terms: Number(paymentTerms) } : {}),
      ...(creditLimit != null ? { credit_limit: Number(creditLimit) } : {}),
    },
  })

  await logAudit({
    companyId,
    userId,
    userName: session.name ?? '',
    action: 'UPDATE',
    module: 'Customer',
    recordId: id,
    oldValues: existing,
    newValues: customer,
  })
  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.company_name,
      email: customer.email,
      phone: customer.phone,
      contactPerson: customer.contact_person,
      address: customer.billing_address,
      paymentTerms: customer.payment_terms ?? 0,
      creditLimit: customer.credit_limit ?? 0,
    },
  })
}
