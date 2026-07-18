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
  const existing = await prisma.deployment.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { status, endDate, hoursPerDay, ratePerHour, shift, shiftType } = body

  const nextStatus = status ?? existing.status
  const nextEndDate = endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate
  if (nextStatus === 'ACTIVE') {
    const overlap = await prisma.deployment.findFirst({
      where: {
        companyId,
        guardId: existing.guardId,
        status: 'ACTIVE',
        id: { not: existing.id },
        startDate: { lte: nextEndDate ?? new Date('9999-12-31') },
        OR: [{ endDate: null }, { endDate: { gte: existing.startDate } }],
      },
    })
    if (overlap) {
      return NextResponse.json({ error: 'Guard is already deployed elsewhere during this period' }, { status: 400 })
    }
  }

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
