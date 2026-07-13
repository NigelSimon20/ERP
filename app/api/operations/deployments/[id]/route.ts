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
  const existing = await prisma.deployment.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { status, endDate, hoursPerDay, ratePerHour, shift, shiftType } = body

  const deployment = await prisma.deployment.update({
    where: { id: params.id },
    data: {
      ...(status ? { status } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(hoursPerDay != null ? { hoursPerDay: Number(hoursPerDay) } : {}),
      ...(ratePerHour != null ? { ratePerHour: Number(ratePerHour) } : {}),
      ...((shift || shiftType) ? { shiftType: (shift || shiftType) } : {}),
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Deployment', recordId: deployment.id, oldValues: existing, newValues: deployment })
  return NextResponse.json({ deployment })
}
