import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { z } from 'zod'

const updateSchema = z.object({
  dueDate: z.string().optional(),
  description: z.string().optional(),
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

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      lineItems: true,
    },
  })

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ invoice })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((invoice.status as string) !== 'DRAFT') {
    return NextResponse.json({ error: 'Only DRAFT invoices can be edited' }, { status: 400 })
  }

  try {
    const data = updateSchema.parse(await req.json())
    const updated = await prisma.salesInvoice.update({
      where: { id: params.id },
      data: {
        due_date: data.dueDate ?? undefined,
        overall_description: data.description,
        updated_date: new Date().toISOString(),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'SalesInvoices',
      recordId: params.id,
      newValues: data,
    })

    return NextResponse.json({ invoice: updated })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const action = new URL(req.url).searchParams.get('action')

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: { lineItems: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'void') {
    if ((invoice.status as string) === 'VOID') {
      return NextResponse.json({ error: 'Invoice already voided' }, { status: 400 })
    }

    const customerId = invoice.customer_id

    await prisma.$transaction(async (tx) => {
      await tx.salesInvoice.update({
        where: { id: params.id },
        data: { status: 'VOID', updated_date: new Date().toISOString() },
      })
      if (customerId) {
        await recalculateCustomerOutstandingBalance(tx, customerId)
      }
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'SalesInvoices',
      recordId: params.id,
      newValues: { status: 'VOID' },
    })

    return NextResponse.json({ success: true })
  }

  if (action === 'pdf') {
    return NextResponse.json({ invoice })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((invoice.status as string) !== 'DRAFT') {
    return NextResponse.json({ error: 'Only DRAFT invoices can be deleted' }, { status: 400 })
  }

  const customerId = invoice.customer_id

  await prisma.$transaction(async (tx) => {
    await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: params.id } })
    await tx.salesInvoice.delete({ where: { id: params.id } })
    if (customerId) {
      await recalculateCustomerOutstandingBalance(tx, customerId)
    }
  })

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'DELETE',
    module: 'SalesInvoices',
    recordId: params.id,
    oldValues: { invoiceNumber: invoice.invoice_number },
  })

  return NextResponse.json({ success: true })
}
