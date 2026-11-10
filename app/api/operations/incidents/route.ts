import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import crypto from 'crypto'
import type { Severity, IncidentStatus } from '@prisma/client'
import { paginate, pageLimit } from '@/lib/utils'
import { incidentCreateSchema } from '@/lib/incident-rules'
import { apiError } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  const severity = searchParams.get('severity') as Severity | null
  const status = searchParams.get('status') as IncidentStatus | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Number(searchParams.get('page') ?? 1)

  const { skip, take } = paginate(page, pageLimit(searchParams))

  const where = {
    companyId,
    ...(siteId ? { siteId } : {}),
    ...(severity ? { severity } : {}),
    ...(status ? { status } : {}),
    ...(from || to ? { reportedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
  }

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({ where, orderBy: [{ reportedAt: 'desc' }, { id: 'asc' }], skip, take }),
    prisma.incident.count({ where }),
  ])

  const [sites, guards, reporters] = await Promise.all([
    prisma.site.findMany({ where: { id: { in: incidents.map((i) => i.siteId) } }, select: { id: true, site_name: true } }),
    prisma.guard.findMany({ where: { id: { in: incidents.map((i) => i.guardId).filter((v): v is string => !!v) } }, select: { id: true, full_name: true } }),
    prisma.user.findMany({ where: { id: { in: incidents.map((i) => i.reportedBy) } }, select: { id: true, name: true } }),
  ])
  const siteById = new Map(sites.map((s) => [s.id, s]))
  const guardById = new Map(guards.map((g) => [g.id, g]))
  const userById = new Map(reporters.map((u) => [u.id, u]))
  const enrichedIncidents = incidents.map((i) => ({
    ...i,
    site: siteById.get(i.siteId) ? { name: siteById.get(i.siteId)!.site_name } : null,
    guard: i.guardId && guardById.get(i.guardId) ? { name: guardById.get(i.guardId)!.full_name } : null,
    reportedByUser: userById.get(i.reportedBy) ? { name: userById.get(i.reportedBy)!.name } : null,
  }))

  return NextResponse.json({ incidents: enrichedIncidents, total, page, pages: Math.ceil(total / take) })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  // P1-11 (BUG-017): an unknown severity ("APOCALYPTIC") used to reach
  // Prisma and 500; a missing description did the same.
  const parsed = incidentCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError(parsed.error)
  const { title, description, siteId, guardId, severity, reportedAt } = parsed.data

  const site = await prisma.site.findFirst({ where: { id: siteId, companyId } })
  if (!site) return NextResponse.json({ error: 'Site not found', code: 'NOT_FOUND' }, { status: 404 })
  if (guardId && !(await prisma.guard.findFirst({ where: { id: guardId, companyId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Guard not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const incident = await prisma.incident.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      title,
      description,
      siteId,
      guardId: guardId || null,
      severity,
      status: 'OPEN',
      reportedAt: reportedAt ?? new Date(),
      reportedBy: userId,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Incident', recordId: incident.id, newValues: incident })

  // Notify all OPERATIONS_MANAGER users for CRITICAL incidents
  if (severity === 'CRITICAL') {
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
          type: 'INCIDENT_CRITICAL',
          title: 'Critical Incident Reported',
          message: `Critical incident: "${title}" has been reported and requires immediate attention.`,
          link: `/operations/incidents/${incident.id}`,
          read: false,
        })),
      })
    }
  }

  return NextResponse.json({ incident }, { status: 201 })
}
