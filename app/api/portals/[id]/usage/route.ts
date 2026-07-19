import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const portal = await prisma.portal.findFirst({ where: { id, companyId: session.companyId } })
  if (!portal) return NextResponse.json({ error: 'Portal not found' }, { status: 404 })

  const [recent, totalLaunches] = await Promise.all([
    prisma.portalUsageLog.findMany({
      where: { portalId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.portalUsageLog.count({ where: { portalId: id, action: 'LAUNCH' } }),
  ])

  const userIds = Array.from(new Set(recent.map((r) => r.userId)))
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  return NextResponse.json({
    totalLaunches,
    recent: recent.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      userName: userMap[r.userId] ?? 'Unknown',
    })),
  })
}
