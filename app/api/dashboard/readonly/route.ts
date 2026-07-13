import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'READ_ONLY'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const siteIds = await prisma.site.findMany({ select: { id: true } }).then(r => r.map(x => x.id))

  const [activeGuards, activeSites, openIncidents, pendingTasks, recentActivity] = await Promise.all([
    prisma.guard.count({ where: { companyId, status: 'ACTIVE' } }),
    prisma.site.count({ where: { status: 'ACTIVE' } }),
    prisma.incident.count({ where: { siteId: { in: siteIds }, status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    prisma.task.count({ where: { companyId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    prisma.auditTrail.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true, module: true, userName: true, createdAt: true } }),
  ])

  return NextResponse.json({
    activeGuards,
    activeSites,
    openIncidents,
    pendingTasks,
    recentActivity: recentActivity.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
  })
}
