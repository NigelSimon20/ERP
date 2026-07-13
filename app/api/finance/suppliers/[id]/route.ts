import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      purchaseInvoices: {
        orderBy: { issueDate: 'desc' },
        take: 20,
        select: { id: true, invoiceNumber: true, issueDate: true, dueDate: true, totalAmount: true, paidAmount: true, balanceDue: true, status: true },
      },
    },
  })
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const payments = await prisma.payment.findMany({
    where: { payment_type: 'PURCHASE_INVOICE', supplier_id: params.id, companyId: session.companyId },
    orderBy: { payment_date: 'desc' },
    take: 20,
    select: { id: true, reference: true, payment_date: true, amount: true },
  })

  return NextResponse.json({ supplier: { ...supplier, outstandingBal: Number(supplier.current_balance ?? 0) }, payments })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supplier = await prisma.supplier.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, email, phone, address, paymentTerms, creditLimit } = body

  const updated = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      company_name: name || undefined,
      email: email || null,
      phone: phone || null,
      address: address || null,
      payment_terms: paymentTerms ? Number(paymentTerms) : undefined,
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'Suppliers', recordId: params.id, oldValues: supplier, newValues: updated })
  return NextResponse.json({ supplier: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supplier = await prisma.supplier.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const invoiceCount = await prisma.purchaseInvoice.count({ where: { supplierId: params.id } })
  if (invoiceCount > 0) return NextResponse.json({ error: `Cannot delete: supplier has ${invoiceCount} purchase invoice(s)` }, { status: 400 })

  await prisma.supplier.delete({ where: { id: params.id } })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'Suppliers', recordId: params.id })
  return NextResponse.json({ success: true })
}
