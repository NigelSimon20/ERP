import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { calculateInventoryValue } from '@/lib/calculations'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.inventoryItem.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: { ...item, unitCost: Number(item.unitCost), totalValue: Number(item.totalValue) } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.inventoryItem.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, category, unit, quantityOnHand, reorderLevel, unitCost } = body

  const qty = quantityOnHand !== undefined ? Number(quantityOnHand) : Number(existing.quantityOnHand)
  const cost = unitCost !== undefined ? Number(unitCost) : Number(existing.unitCost)
  const totalValue = calculateInventoryValue(qty, cost)

  const updated = await prisma.$transaction(async (tx) => {
    return tx.inventoryItem.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(category && { category }),
        ...(unit && { unit }),
        quantityOnHand: qty,
        ...(reorderLevel !== undefined && { reorderLevel: Number(reorderLevel) }),
        unitCost: cost,
        totalValue,
      },
    })
  })

  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'Inventory', recordId: params.id, oldValues: existing, newValues: updated })
  return NextResponse.json({ item: { ...updated, unitCost: Number(updated.unitCost), totalValue: Number(updated.totalValue) } })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.inventoryItem.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.inventoryItem.delete({ where: { id: params.id } })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'Inventory', recordId: params.id })
  return NextResponse.json({ success: true })
}

