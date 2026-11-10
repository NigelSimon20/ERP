import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'
import { nextGrnNumber } from '@/lib/auto-numbers'
import { apiError } from '@/lib/api-error'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const purchaseOrderId = searchParams.get('purchaseOrderId') || undefined
  const page = Number(searchParams.get('page') ?? '1')

  const where: any = { companyId: session.companyId, ...(purchaseOrderId && { purchaseOrderId }) }

  const [rows, total] = await Promise.all([
    prisma.goodsReceivedNote.findMany({ where, orderBy: { receivedAt: 'desc' }, ...paginate(page) }),
    prisma.goodsReceivedNote.count({ where }),
  ])

  const poIds = Array.from(new Set(rows.map((r) => r.purchaseOrderId)))
  const pos = poIds.length ? await prisma.purchaseOrder.findMany({ where: { id: { in: poIds } }, select: { id: true, poNumber: true, supplierId: true } }) : []
  const poMap = Object.fromEntries(pos.map((p) => [p.id, p]))

  return NextResponse.json({
    goodsReceivedNotes: rows.map((r) => ({ ...r, purchaseOrder: poMap[r.purchaseOrderId] ? { id: r.purchaseOrderId, poNumber: poMap[r.purchaseOrderId].poNumber } : null })),
    total,
    page,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { purchaseOrderId, receivedBy, receivedAt, notes, lines } = body
    if (!purchaseOrderId || !receivedBy) return NextResponse.json({ error: 'purchaseOrderId, receivedBy required' }, { status: 400 })
    if (!Array.isArray(lines) || lines.length === 0) return NextResponse.json({ error: 'At least one received line required' }, { status: 400 })

    const po = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, companyId: session.companyId } })
    if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    if (['DRAFT', 'RECEIVED', 'CLOSED', 'CANCELLED'].includes(po.status)) {
      return NextResponse.json({ error: `Cannot receive goods against a ${po.status} purchase order` }, { status: 409 })
    }

    const poLines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId } })
    const poLineMap = Object.fromEntries(poLines.map((l) => [l.id, l]))

    for (const l of lines as { poLineId: string; quantityReceived: number; condition?: string }[]) {
      const poLine = poLineMap[l.poLineId]
      if (!poLine) return NextResponse.json({ error: `Line ${l.poLineId} does not belong to this purchase order` }, { status: 400 })
      const outstanding = poLine.quantity - poLine.quantityReceived
      if (l.quantityReceived <= 0 || l.quantityReceived > outstanding) {
        return NextResponse.json({ error: `Received quantity for "${poLine.description}" must be between 0 and ${outstanding}` }, { status: 400 })
      }
    }

    const grnNumber = await nextGrnNumber(session.companyId)

    const grn = await prisma.$transaction(async (tx) => {
      const g = await tx.goodsReceivedNote.create({
        data: {
          companyId: session.companyId,
          purchaseOrderId,
          grnNumber,
          receivedBy,
          receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
          notes: notes || null,
        },
      })
      await tx.goodsReceivedNoteLine.createMany({
        data: (lines as { poLineId: string; quantityReceived: number; condition?: string }[]).map((l) => {
          const poLine = poLineMap[l.poLineId]
          return { grnId: g.id, poLineId: l.poLineId, description: poLine.description, quantityOrdered: poLine.quantity, quantityReceived: l.quantityReceived, condition: l.condition || 'GOOD' }
        }),
      })
      for (const l of lines as { poLineId: string; quantityReceived: number }[]) {
        await tx.purchaseOrderLine.update({ where: { id: l.poLineId }, data: { quantityReceived: { increment: l.quantityReceived } } })
      }

      const updatedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId } })
      const allReceived = updatedLines.every((l) => l.quantityReceived >= l.quantity)
      const anyReceived = updatedLines.some((l) => l.quantityReceived > 0)
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status },
      })

      return g
    })

    await logAudit({
      companyId: session.companyId, userId: session.userId, userName: session.name,
      action: 'CREATE', module: 'GoodsReceivedNotes', recordId: grn.id,
      newValues: { grnNumber, purchaseOrderId, poNumber: po.poNumber },
    })

    return NextResponse.json({ goodsReceivedNote: grn }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
