import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const requests = await prisma.coverageRequest.findMany({
    where: { ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { siteId, reason, guardsNeeded, startDate, endDate } = body

  if (!siteId || !reason || !startDate || !endDate) {
    return NextResponse.json({ error: 'siteId, reason, startDate, and endDate are required' }, { status: 400 })
  }

  const request = await prisma.coverageRequest.create({
    data: {
      id: crypto.randomUUID(),
      siteId,
      reason,
      requiredGuards: Number(guardsNeeded) || 1,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'PENDING',
      requestedBy: userId,
      updatedAt: new Date(),
    },
  })

  await logAudit({ companyId: session.companyId, userId, userName: session.name, action: 'CREATE', module: 'CoverageRequest', recordId: request.id, newValues: request })

  // Notify OPERATIONS_MANAGER users
  const managers = await prisma.user.findMany({
    where: { companyId, role: 'OPERATIONS_MANAGER', active: true },
    select: { id: true },
  })
  if (managers.length > 0) {
    await prisma.notification.createMany({
      data: managers.map((m) => ({
        id: crypto.randomUUID(),
        companyId,
        userId: m.id,
        type: 'COVERAGE_REQUEST',
        title: 'New Coverage Request',
        message: `Coverage request ${request.id}: ${reason}`,
        link: `/operations/coverage-requests/${request.id}`,
        read: false,
      })),
    })
  }

  return NextResponse.json({ request }, { status: 201 })
}
