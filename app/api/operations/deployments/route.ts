import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import type { DeploymentStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  const guardId = searchParams.get('guardId')
  const status = searchParams.get('status') as DeploymentStatus | null

  const deployments = await prisma.deployment.findMany({
    where: {
      ...(siteId ? { siteId } : {}),
      ...(guardId ? { guardId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { startDate: 'desc' },
  })

  return NextResponse.json({ deployments })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { guardId, siteId, shift, shiftType, startDate, endDate, hoursPerDay, ratePerHour } = body

  if (!guardId || !siteId || !startDate) {
    return NextResponse.json({ error: 'guardId, siteId, and startDate are required' }, { status: 400 })
  }

  if (endDate && new Date(endDate) <= new Date(startDate)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  // Overlap check
  const overlap = await prisma.deployment.findFirst({
    where: {
      guardId,
      status: 'ACTIVE',
      startDate: { lte: endDate ? new Date(endDate) : new Date('9999-12-31') },
      OR: [{ endDate: null }, { endDate: { gte: new Date(startDate) } }],
    },
  })

  if (overlap) {
    return NextResponse.json(
      { error: 'Guard is already deployed during this period' },
      { status: 400 }
    )
  }

  const deployment = await prisma.deployment.create({
    data: {
      id: crypto.randomUUID(),
      guardId,
      siteId,
      shiftType: (shift || shiftType) || 'DAY',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      hoursPerDay: hoursPerDay != null ? Number(hoursPerDay) : 8,
      ratePerHour: ratePerHour != null ? Number(ratePerHour) : 0,
      updatedAt: new Date(),
      status: 'ACTIVE',
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Deployment', recordId: deployment.id, newValues: deployment })

  return NextResponse.json({ deployment }, { status: 201 })
}
