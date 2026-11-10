import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { incidentUpdateSchema } from '@/lib/incident-rules'
import { apiError } from '@/lib/api-error'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const incident = await prisma.incident.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [site, guard, reportedByUser] = await Promise.all([
    prisma.site.findUnique({ where: { id: incident.siteId }, select: { site_name: true } }),
    incident.guardId ? prisma.guard.findUnique({ where: { id: incident.guardId }, select: { full_name: true } }) : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: incident.reportedBy }, select: { name: true } }),
  ])

  const result = {
    ...incident,
    site: site ? { id: incident.siteId, site_name: site.site_name } : null,
    guard: guard ? { id: incident.guardId, full_name: guard.full_name } : null,
    reportedByUser: reportedByUser ? { name: reportedByUser.name } : null,
  }

  return NextResponse.json({ incident: result })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.incident.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = incidentUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiError(parsed.error)
  const { status, notes, severity, title, description } = parsed.data

  const wasResolved = existing.status !== 'RESOLVED' && status === 'RESOLVED'

  const incident = await prisma.incident.update({
    where: { id: params.id },
    data: {
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(severity ? { severity } : {}),
      ...(title ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(wasResolved ? { resolvedAt: new Date() } : {}),
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Incident', recordId: incident.id, oldValues: existing, newValues: incident })
  return NextResponse.json({ incident })
}
