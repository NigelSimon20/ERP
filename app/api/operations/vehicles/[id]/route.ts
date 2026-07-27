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
  const existing = await prisma.vehicle.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { registrationNumber, make, model, assignedSiteId, assignedGuardId, status } = body

  const vehicle = await prisma.vehicle.update({
    where: { id: params.id },
    data: {
      ...(registrationNumber ? { registrationNumber } : {}),
      ...(make !== undefined ? { make: make || null } : {}),
      ...(model !== undefined ? { model: model || null } : {}),
      ...(assignedSiteId !== undefined ? { assignedSiteId: assignedSiteId || null } : {}),
      ...(assignedGuardId !== undefined ? { assignedGuardId: assignedGuardId || null } : {}),
      ...(status ? { status } : {}),
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Vehicle', recordId: vehicle.id, oldValues: existing, newValues: vehicle })
  return NextResponse.json({ vehicle })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.vehicle.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.vehicle.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName, action: 'DELETE', module: 'Vehicle', recordId: params.id, oldValues: existing })
  return NextResponse.json({ success: true })
}
