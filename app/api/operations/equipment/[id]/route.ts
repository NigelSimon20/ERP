import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { toEquipmentDto } from '@/lib/equipment'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.equipment.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, code, equipmentClass, category, quantityInStock, quantityIssued, quantityDamaged, quantityLost, unitCost, location, notes, isActive } = body

  const item = await prisma.equipment.update({
    where: { id: params.id },
    data: {
      ...(name ? { equipment_name: name } : {}),
      ...(code !== undefined ? { equipment_code: code || null } : {}),
      ...(equipmentClass !== undefined ? { equipment_class: equipmentClass || null } : {}),
      ...(category ? { category } : {}),
      ...(quantityInStock != null ? { quantity_in_stock: Number(quantityInStock) } : {}),
      ...(quantityIssued != null ? { quantity_issued: Number(quantityIssued) } : {}),
      ...(quantityDamaged != null ? { quantity_damaged: Number(quantityDamaged) } : {}),
      ...(quantityLost != null ? { quantity_lost: Number(quantityLost) } : {}),
      ...(unitCost != null ? { unit_cost: Number(unitCost) } : {}),
      ...(location !== undefined ? { location: location || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(isActive !== undefined ? { is_active: !!isActive } : {}),
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Equipment', recordId: item.id, oldValues: existing, newValues: item })
  return NextResponse.json({ equipment: toEquipmentDto(item) })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.equipment.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.equipment.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName, action: 'DELETE', module: 'Equipment', recordId: params.id, oldValues: existing })
  return NextResponse.json({ success: true })
}
