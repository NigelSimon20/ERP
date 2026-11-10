import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  paymentTerms: z.number().optional(),
  creditLimit: z.number().optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customers = await prisma.customer.findMany({
    where: { companyId: session.companyId },
    orderBy: { company_name: 'asc' },
  })

  const [balanceAggs, invoiceCountAggs] = await Promise.all([
    prisma.salesInvoice.groupBy({
      by: ['customer_id'],
      where: { status: { not: 'Void' }, companyId: session.companyId },
      _sum: { balance_due: true },
    }),
    prisma.salesInvoice.groupBy({
      by: ['customer_id'],
      where: { companyId: session.companyId },
      _count: { id: true },
    }),
  ])

  const balanceMap = Object.fromEntries(
    balanceAggs.map((b) => [b.customer_id, Number(b._sum.balance_due ?? 0)]),
  )
  const invoiceCountMap = Object.fromEntries(
    invoiceCountAggs.map((c) => [c.customer_id, c._count.id]),
  )

  const result = customers.map((c) => ({
    id: c.id,
    name: c.company_name ?? '',
    email: c.email,
    phone: c.phone,
    address: c.billing_address,
    paymentTerms: c.payment_terms ?? 30,
    creditLimit: Number(c.credit_limit ?? 0),
    outstandingBal: balanceMap[c.id] ?? 0,
    invoiceCount: invoiceCountMap[c.id] ?? 0,
  }))

  return NextResponse.json({ customers: result })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = customerSchema.parse(await req.json())

    const customer = await prisma.customer.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        company_name: data.name,
        email: data.email ?? '',
        phone: data.phone ?? '',
        billing_address: data.address ?? '',
        vat_number: data.taxNumber ?? '',
        contact_person: data.contactPerson ?? '',
        payment_terms: data.paymentTerms ?? 30,
        credit_limit: data.creditLimit ?? 0,
        opening_balance: 0,
        current_balance: 0,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'Customers',
      recordId: customer.id,
      newValues: { name: data.name, email: data.email },
    })

    return NextResponse.json({ customer }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
