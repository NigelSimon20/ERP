import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const grn = await prisma.goodsReceivedNote.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!grn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [po, lineItems] = await Promise.all([
    prisma.purchaseOrder.findUnique({ where: { id: grn.purchaseOrderId }, select: { id: true, poNumber: true, supplierId: true } }),
    prisma.goodsReceivedNoteLine.findMany({ where: { grnId: grn.id } }),
  ])

  return NextResponse.json({ goodsReceivedNote: { ...grn, purchaseOrder: po, lineItems } })
}
