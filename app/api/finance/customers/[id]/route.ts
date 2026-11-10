import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
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

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const salesInvoices = await prisma.salesInvoice.findMany({
    where: { customer_id: params.id },
    orderBy: { invoice_date: 'desc' },
    take: 20,
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

  return NextResponse.json({ customer: { ...customer, salesInvoices } })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: params.id, companyId: session.companyId },
    })
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data = updateSchema.parse(await req.json())

    const updated = await prisma.customer.update({
      where: { id: params.id },
      data: {
        company_name: data.name,
        email: data.email,
        phone: data.phone,
        billing_address: data.address,
        vat_number: data.taxNumber,
        contact_person: data.contactPerson,
        payment_terms: data.paymentTerms,
        credit_limit: data.creditLimit,
        updated_date: new Date().toISOString(),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'Customers',
      recordId: params.id,
      oldValues: { company_name: customer.company_name },
      newValues: data,
    })

    return NextResponse.json({ customer: updated })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const invoiceCount = await prisma.salesInvoice.count({ where: { customer_id: params.id } })
  if (invoiceCount > 0) {
    return NextResponse.json({ error: 'Cannot delete — customer has invoices' }, { status: 400 })
  }

  await prisma.customer.delete({ where: { id: params.id } })

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'DELETE',
    module: 'Customers',
    recordId: params.id,
    oldValues: { company_name: customer.company_name },
  })

  return NextResponse.json({ success: true })
}
