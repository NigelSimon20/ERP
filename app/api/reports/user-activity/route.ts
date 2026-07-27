import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// Reshapes the same AuditTrail table the Audit Trail page already reads --
// grouped per user instead of filtered to one, since a "User Activity
// Report" is just a different lens on the same log, not a new source of truth.
export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where = {
    companyId: session.companyId,
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
      },
    }),
  }

  const logs = await prisma.auditTrail.findMany({
    where,
    select: { userId: true, userName: true, action: true, module: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  const byUser = new Map<string, { userId: string; userName: string; totalActions: number; loginCount: number; firstActivity: Date; lastActivity: Date; moduleCounts: Map<string, number> }>()
  for (const log of logs) {
    let entry = byUser.get(log.userId)
    if (!entry) {
      entry = { userId: log.userId, userName: log.userName, totalActions: 0, loginCount: 0, firstActivity: log.createdAt, lastActivity: log.createdAt, moduleCounts: new Map() }
      byUser.set(log.userId, entry)
    }
    entry.totalActions += 1
    if (log.action === 'LOGIN') entry.loginCount += 1
    if (log.createdAt < entry.firstActivity) entry.firstActivity = log.createdAt
    if (log.createdAt > entry.lastActivity) entry.lastActivity = log.createdAt
    entry.moduleCounts.set(log.module, (entry.moduleCounts.get(log.module) ?? 0) + 1)
  }

  const users = Array.from(byUser.values())
    .map((u) => ({
      userId: u.userId, userName: u.userName, totalActions: u.totalActions, loginCount: u.loginCount,
      firstActivity: u.firstActivity, lastActivity: u.lastActivity,
      byModule: Array.from(u.moduleCounts.entries()).map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.totalActions - a.totalActions)

  return NextResponse.json({ from, to, users })
}
