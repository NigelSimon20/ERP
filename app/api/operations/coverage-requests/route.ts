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
    where: { companyId, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
  })

  const [sites, requesters, approvers, filledCounts] = await Promise.all([
    prisma.site.findMany({ where: { id: { in: requests.map((r) => r.siteId) } }, select: { id: true, site_name: true, billing_rate_day: true, billing_rate_night: true } }),
    prisma.user.findMany({ where: { id: { in: requests.map((r) => r.requestedBy) } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: requests.map((r) => r.approvedBy).filter((v): v is string => !!v) } }, select: { id: true, name: true } }),
    prisma.deployment.groupBy({ by: ['sourceCoverageRequestId'], where: { sourceCoverageRequestId: { in: requests.map((r) => r.id) }, status: 'ACTIVE' }, _count: { _all: true } }),
  ])
  const siteById = new Map(sites.map((s) => [s.id, s]))
  const userById = new Map([...requesters, ...approvers].map((u) => [u.id, u]))
  const filledById = new Map(filledCounts.map((f) => [f.sourceCoverageRequestId, f._count._all]))
  const enrichedRequests = requests.map((r) => ({
    ...r,
    guardsNeeded: r.requiredGuards,
    filledCount: filledById.get(r.id) ?? 0,
    site: siteById.get(r.siteId)
      ? { name: siteById.get(r.siteId)!.site_name, billingRateDay: siteById.get(r.siteId)!.billing_rate_day, billingRateNight: siteById.get(r.siteId)!.billing_rate_night }
      : null,
    requestedByUser: userById.get(r.requestedBy) ? { name: userById.get(r.requestedBy)!.name } : null,
    approvedByUser: r.approvedBy && userById.get(r.approvedBy) ? { name: userById.get(r.approvedBy)!.name } : null,
  }))

  return NextResponse.json({ requests: enrichedRequests })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { siteId, reason, guardsNeeded, startDate, endDate } = body

  if (!siteId || !reason || !startDate) {
    return NextResponse.json({ error: 'siteId, reason, and startDate are required' }, { status: 400 })
  }

  const site = await prisma.site.findFirst({ where: { id: siteId, companyId } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const request = await prisma.coverageRequest.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      siteId,
      reason,
      requiredGuards: Number(guardsNeeded) || 1,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
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
