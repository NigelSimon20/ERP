import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import crypto from 'crypto'
import type { PatrolStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  const guardId = searchParams.get('guardId')
  const date = searchParams.get('date')
  const status = searchParams.get('status') as PatrolStatus | null

  const where = {
    ...(siteId ? { siteId } : {}),
    ...(guardId ? { guardId } : {}),
    ...(status ? { status } : {}),
    ...(date ? {
      scheduledTime: {
        gte: new Date(`${date}T00:00:00`),
        lte: new Date(`${date}T23:59:59`),
      },
    } : {}),
  }

  const patrols = await prisma.patrol.findMany({ where, orderBy: { scheduledTime: 'asc' } })

  // Compliance rate per site
  const siteStats: Record<string, { total: number; completed: number }> = {}
  for (const p of patrols) {
    if (!siteStats[p.siteId]) siteStats[p.siteId] = { total: 0, completed: 0 }
    siteStats[p.siteId].total++
    if (p.status === 'COMPLETED') siteStats[p.siteId].completed++
  }
  const complianceRates = Object.fromEntries(
    Object.entries(siteStats).map(([id, s]) => [id, s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0])
  )

  return NextResponse.json({ patrols, complianceRates })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { siteId, guardId, scheduledTime, notes } = body

  if (!siteId || !scheduledTime) return NextResponse.json({ error: 'siteId and scheduledTime are required' }, { status: 400 })

  const patrol = await prisma.patrol.create({
    data: {
      id: crypto.randomUUID(),
      siteId,
      guardId: guardId || null,
      scheduledTime: new Date(scheduledTime),
      updatedAt: new Date(),
      status: 'SCHEDULED',
      notes: notes || null,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Patrol', recordId: patrol.id, newValues: patrol })
  return NextResponse.json({ patrol }, { status: 201 })
}
