import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { toEquipmentDto } from '@/lib/equipment'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const active = searchParams.get('active')
  const status = searchParams.get('status')
  const equipment = await prisma.equipment.findMany({
    where: {
      companyId,
      ...(category ? { category } : {}),
      ...(active ? { is_active: active === 'true' } : {}),
      ...(status === 'AVAILABLE' ? { is_active: true } : {}),
    },
    orderBy: { equipment_name: 'asc' },
  })

  const filtered = status === 'AVAILABLE'
    ? equipment.filter((e) => (e.quantity_in_stock ?? 0) - (e.quantity_issued ?? 0) - (e.quantity_damaged ?? 0) - (e.quantity_lost ?? 0) > 0)
    : equipment

  return NextResponse.json({ equipment: filtered.map(toEquipmentDto) })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { name, code, equipmentClass, category, quantityInStock, unitCost, location, notes } = body

  if (!name) return NextResponse.json({ error: 'Equipment name is required' }, { status: 400 })

  const item = await prisma.equipment.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      equipment_name: name,
      equipment_code: code || null,
      equipment_class: equipmentClass || null,
      category: category || 'Other',
      quantity_in_stock: quantityInStock != null ? Number(quantityInStock) : 0,
      quantity_issued: 0,
      quantity_damaged: 0,
      quantity_lost: 0,
      unit_cost: unitCost != null ? Number(unitCost) : null,
      location: location || null,
      notes: notes || null,
      is_active: true,
    },
  })
  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Equipment', recordId: item.id, newValues: item })
  return NextResponse.json({ equipment: toEquipmentDto(item) }, { status: 201 })
}
