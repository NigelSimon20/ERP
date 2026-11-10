import crypto from 'crypto'
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

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.inventoryItem.findMany({
    where: { companyId: session.companyId },
    orderBy: { itemName: 'asc' },
  })

  const mapped = items.map((i) => ({
    ...i,
    name: i.itemName,
    unitCost: Number(i.unitCost),
    totalValue: Number(i.totalValue),
    // Numeric compare: Decimal vs Decimal compared as strings, so 10 <= 5 was
    // true ("10" < "5") and full stock showed as Low (BUG-022).
    lowStock: Number(i.quantityOnHand) <= Number(i.reorderLevel),
  }))

  const totalValue = mapped.reduce((s, i) => s + i.totalValue, 0)
  const lowStockCount = mapped.filter((i) => i.lowStock).length

  return NextResponse.json({ items: mapped, totalItems: mapped.length, totalValue, lowStockCount })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, category, unit, quantityOnHand, reorderLevel, unitCost } = body

  if (!name) return NextResponse.json({ error: 'Item name is required' }, { status: 400 })

  const qty = Number(quantityOnHand) || 0
  const cost = Number(unitCost) || 0
  const totalValue = calculateInventoryValue(qty, cost)

  const item = await prisma.$transaction(async (tx) => {
    return tx.inventoryItem.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        itemName: name,
        category: category || 'Other',
        unit: unit || 'each',
        quantityOnHand: qty,
        reorderLevel: Number(reorderLevel) || 0,
        unitCost: cost,
        totalValue,
        updatedAt: new Date(),
      },
    })
  })

  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'Inventory', recordId: item.id })
  return NextResponse.json({ item: { ...item, name: item.itemName, unitCost: Number(item.unitCost), totalValue: Number(item.totalValue) } }, { status: 201 })
}

