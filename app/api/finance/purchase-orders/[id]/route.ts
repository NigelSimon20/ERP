import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const po = await prisma.purchaseOrder.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [supplier, lineItems, receipts] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: po.supplierId }, select: { id: true, company_name: true } }),
    prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } }),
    prisma.goodsReceivedNote.findMany({ where: { purchaseOrderId: po.id }, orderBy: { receivedAt: 'desc' } }),
  ])

  return NextResponse.json({ purchaseOrder: { ...po, supplier: { id: supplier?.id ?? po.supplierId, name: supplier?.company_name ?? '' }, lineItems, receipts } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.purchaseOrder.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve') {
    if (existing.status !== 'DRAFT' && existing.status !== 'SENT') return NextResponse.json({ error: 'Only DRAFT or SENT purchase orders can be approved' }, { status: 409 })
    const updated = await prisma.purchaseOrder.update({ where: { id: params.id }, data: { status: 'APPROVED' } })
    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'PurchaseOrders', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'APPROVED' } })
    return NextResponse.json({ purchaseOrder: updated })
  }

  if (action === 'cancel') {
    if (['RECEIVED', 'PARTIALLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(existing.status)) {
      return NextResponse.json({ error: `Cannot cancel a ${existing.status} purchase order` }, { status: 409 })
    }
    const updated = await prisma.purchaseOrder.update({ where: { id: params.id }, data: { status: 'CANCELLED' } })
    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'PurchaseOrders', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'CANCELLED' } })
    return NextResponse.json({ purchaseOrder: updated })
  }

  const body = await req.json()
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT purchase orders can be edited' }, { status: 409 })
  const { expectedDate, notes } = body
  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: { ...(expectedDate !== undefined ? { expectedDate: expectedDate ? new Date(expectedDate) : null } : {}), ...(notes !== undefined ? { notes: notes || null } : {}) },
  })
  return NextResponse.json({ purchaseOrder: updated })
}
