import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  const existing = await prisma.equipment.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'assign') {
    return NextResponse.json({ error: 'Assign action not supported for Equipment' }, { status: 400 })
  }

  if (action === 'unassign') {
    return NextResponse.json({ error: 'Unassign action not supported for Equipment' }, { status: 400 })
  }

  // Generic update
  const body = await req.json()
  const { name, serialNumber, category, condition, value, purchaseDate, notes } = body

  const item = await prisma.equipment.update({
    where: { id: params.id },
    data: {
      ...(name ? { equipment_name: name } : {}),
      ...(serialNumber !== undefined ? { serial_numbers: serialNumber || null } : {}),
      ...(category ? { category } : {}),
      ...(condition ? { description: condition } : {}),
      ...(value != null ? { unit_cost: Number(value) } : {}),
      ...(purchaseDate !== undefined ? { created_date: purchaseDate ? new Date(purchaseDate).toISOString() : null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Equipment', recordId: item.id, oldValues: existing, newValues: item })
  return NextResponse.json({ equipment: item })
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
