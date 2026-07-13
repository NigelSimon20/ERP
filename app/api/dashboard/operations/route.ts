import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(today.getTime() + 86_400_000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [siteIds, guardIds] = await Promise.all([
    prisma.site.findMany({ select: { id: true } }).then(r => r.map(x => x.id)),
    prisma.guard.findMany({ where: { companyId }, select: { id: true } }).then(r => r.map(x => x.id)),
  ])

  const [
    activeGuards, activeSites,
    deployedTodayIds,
    presentToday, absentToday,
    openIncidents, investigatingIncidents, criticalIncidents,
    patrolsDueToday, patrolsCompleted, patrolsMissedMonth,
    pendingCoverage, equipmentAvailable, equipmentAssigned,
    incidentGroups, topSiteAttendance,
    recentIncidents, upcomingPatrols,
  ] = await Promise.all([
    prisma.guard.count({ where: { companyId, status: 'ACTIVE' } }),
    prisma.site.count({ where: { status: 'ACTIVE' } }),
    prisma.deployment.findMany({ where: { guardId: { in: guardIds }, status: 'ACTIVE', startDate: { lte: todayEnd } }, select: { guardId: true } }),
    prisma.attendance.count({ where: { guardId: { in: guardIds }, date: { gte: today, lt: todayEnd }, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { guardId: { in: guardIds }, date: { gte: today, lt: todayEnd }, status: 'ABSENT' } }),
    prisma.incident.count({ where: { siteId: { in: siteIds }, status: 'OPEN' } }),
    prisma.incident.count({ where: { siteId: { in: siteIds }, status: 'INVESTIGATING' } }),
    prisma.incident.count({ where: { siteId: { in: siteIds }, severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
    prisma.patrol.count({ where: { siteId: { in: siteIds }, scheduledTime: { gte: today, lt: todayEnd }, status: 'SCHEDULED' } }),
    prisma.patrol.count({ where: { siteId: { in: siteIds }, scheduledTime: { gte: today, lt: todayEnd }, status: 'COMPLETED' } }),
    prisma.patrol.count({ where: { siteId: { in: siteIds }, scheduledTime: { gte: monthStart }, status: 'MISSED' } }),
    prisma.coverageRequest.count({ where: { siteId: { in: siteIds }, status: 'PENDING' } }),
    prisma.equipment.count({}), // Equipment doesn't have status field
    prisma.equipment.count({}), // Equipment doesn't have status field
    prisma.incident.groupBy({ by: ['severity'], where: { siteId: { in: siteIds }, reportedAt: { gte: monthStart } }, _count: { _all: true } }),
    prisma.site.findMany({ where: { status: 'ACTIVE' }, take: 10, select: { id: true, site_name: true } }),
    prisma.incident.findMany({
      where: { siteId: { in: siteIds } },
      orderBy: { reportedAt: 'desc' },
      take: 5,
      select: { title: true, siteId: true, severity: true, status: true, reportedAt: true },
    }),
    prisma.patrol.findMany({
      where: { siteId: { in: siteIds }, scheduledTime: { gte: now }, status: { in: ['SCHEDULED', 'DELAYED'] } },
      orderBy: { scheduledTime: 'asc' },
      take: 10,
      select: { siteId: true, guardId: true, scheduledTime: true, status: true },
    }),
  ])

  const deployedToday = new Set(deployedTodayIds.map(d => d.guardId)).size
  const patrolsTotal = patrolsCompleted + patrolsMissedMonth
  const patrolComplianceRate = patrolsTotal > 0 ? Math.round((patrolsCompleted / patrolsTotal) * 100) : 100
  const attendanceRate = (presentToday + absentToday) > 0 ? Math.round((presentToday / (presentToday + absentToday)) * 100) : 0

  // Attendance rates per site (month)
  const siteAttendanceCounts = await Promise.all(
    topSiteAttendance.map(async s => {
      const [pres, tot] = await Promise.all([
        prisma.attendance.count({ where: { siteId: s.id, date: { gte: monthStart }, status: 'PRESENT' } }),
        prisma.attendance.count({ where: { siteId: s.id, date: { gte: monthStart } } }),
      ])
      return { siteName: s.site_name ?? 'Unknown', rate: tot > 0 ? Math.round((pres / tot) * 100) : 0 }
    })
  )

  const siteMap = Object.fromEntries(topSiteAttendance.map(s => [s.id, s.site_name ?? 'Unknown']))
  const guardMap = Object.fromEntries(
    await prisma.guard.findMany({ where: { id: { in: upcomingPatrols.map(p => p.guardId) } }, select: { id: true, full_name: true } }).then(r => r.map(g => [g.id, g.full_name]))
  )

  return NextResponse.json({
    activeGuards,
    activeSites,
    deployedToday,
    undeployedGuards: Math.max(0, activeGuards - deployedToday),
    present:           presentToday,
    absent:            absentToday,
    attendanceRate,
    openIncidents,
    investigatingIncidents,
    criticalIncidents,
    patrolsDueToday,
    patrolsCompleted,
    patrolComplianceRate,
    pendingCoverage,
    equipmentAvailable,
    equipmentAssigned,
    incidentsBySeverity: incidentGroups.map(g => ({ severity: g.severity, count: g._count._all })),
    siteAttendanceRates: siteAttendanceCounts.filter(s => s.rate > 0),
    recentIncidents: recentIncidents.map(i => ({
      title:      i.title,
      siteName:   siteMap[i.siteId] ?? 'Unknown',
      severity:   i.severity,
      status:     i.status,
      reportedAt: i.reportedAt.toISOString(),
    })),
    upcomingPatrols: upcomingPatrols.map(p => ({
      siteName:      siteMap[p.siteId] ?? 'Unknown',
      guardName:     guardMap[p.guardId] ?? 'Unknown',
      scheduledTime: p.scheduledTime.toISOString(),
      status:        p.status,
    })),
  })
}
