import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { } = session
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const category = searchParams.get('category')
  const equipment = await prisma.equipment.findMany({
    where: {
      ...(category ? { category } : {}),
    },
    orderBy: { equipment_name: 'asc' },
  })

  return NextResponse.json({ equipment })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { name, serialNumber, category, condition, value, purchaseDate, notes } = body

  if (!name) return NextResponse.json({ error: 'Equipment name is required' }, { status: 400 })

  const item = await prisma.equipment.create({
    data: {
      id: crypto.randomUUID(),
      equipment_name: name,
      serial_numbers: serialNumber || null,
      category: category || 'Other',
      description: condition || null,
      unit_cost: value != null ? Number(value) : null,
      created_date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
      notes: notes || null,
    },
  })
  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Equipment', recordId: item.id, newValues: item })
  return NextResponse.json({ equipment: item }, { status: 201 })
}
