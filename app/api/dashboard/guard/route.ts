import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'GUARD'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { guardId, companyId } = session

  if (!guardId) {
    return NextResponse.json({
      myProfile: null,
      myCurrentDeployment: null,
      myAttendanceToday: null,
      myMonthStats: { daysPresent: 0, daysAbsent: 0, hoursWorked: 0, overtimeHours: 0 },
      myLatestPayslip: null,
      myOpenTasks: [],
      myUpcomingPatrols: [],
      myPendingLeave: 0,
    })
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(today.getTime() + 86_400_000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Get the userId via session for task assignment
  const { userId } = session

  const [
    myProfile, myCurrentDeployment, myAttendanceToday,
    daysPresent, daysAbsent, hoursAgg, overtimeAgg,
    myLatestPayslip, myOpenTasks, myUpcomingPatrols, myPendingLeave,
  ] = await Promise.all([
    prisma.guard.findUnique({ where: { id: guardId }, select: { id: true, full_name: true, position: true, department: true, employee_code: true, status: true } }),
    prisma.deployment.findFirst({
      where: { guardId, status: 'ACTIVE' },
      select: { siteId: true, shiftType: true },
    }).catch(() => null),
    prisma.attendance.findFirst({ where: { guardId, date: { gte: today, lt: todayEnd } }, select: { status: true, checkIn: true, checkOut: true, hoursWorked: true } }),
    prisma.attendance.count({ where: { guardId, date: { gte: monthStart }, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { guardId, date: { gte: monthStart }, status: 'ABSENT' } }),
    prisma.attendance.aggregate({ where: { guardId, date: { gte: monthStart } }, _sum: { hoursWorked: true } }),
    prisma.attendance.aggregate({ where: { guardId, date: { gte: monthStart } }, _sum: { overtimeHours: true } }),
    Promise.resolve(null), // Payslip query removed - Payslip model doesn't have guardId field
    prisma.task.findMany({
      where: { companyId, assignedTo: userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { dueDate: 'asc' },
      take: 10,
      select: { id: true, title: true, dueDate: true, priority: true, status: true },
    }),
    prisma.patrol.findMany({
      where: { guardId, scheduledTime: { gte: now } },
      orderBy: { scheduledTime: 'asc' },
      take: 3,
      select: { siteId: true, scheduledTime: true, status: true },
    }),
    prisma.leaveRequest.count({ where: { guardId, status: 'PENDING' } }),
  ])

  // Resolve site info for deployment (since it's a raw siteId FK)
  let deployment = null
  if (myCurrentDeployment) {
    const site = await prisma.site.findUnique({ where: { id: myCurrentDeployment.siteId }, select: { site_name: true, address: true } })
    deployment = { shiftType: myCurrentDeployment.shiftType, site }
  } else {
    const dep = await prisma.deployment.findFirst({ where: { guardId, status: 'ACTIVE' }, select: { siteId: true, shiftType: true } })
    if (dep) {
      const site = await prisma.site.findUnique({ where: { id: dep.siteId }, select: { site_name: true, address: true } })
      deployment = { shiftType: dep.shiftType, site }
    }
  }

  // Resolve site names for patrols
  const patrolSiteIds = Array.from(new Set(myUpcomingPatrols.map(p => p.siteId)))
  const patrolSites = await prisma.site.findMany({ where: { id: { in: patrolSiteIds } }, select: { id: true, site_name: true } })
  const siteMap = Object.fromEntries(patrolSites.map(s => [s.id, s.site_name]))

  return NextResponse.json({
    myProfile,
    myCurrentDeployment: deployment,
    myAttendanceToday: myAttendanceToday ? {
      status:       myAttendanceToday.status,
      checkIn:      myAttendanceToday.checkIn?.toISOString() ?? null,
      checkOut:     myAttendanceToday.checkOut?.toISOString() ?? null,
      hoursWorked:  Number(myAttendanceToday.hoursWorked),
    } : null,
    myMonthStats: {
      daysPresent:   daysPresent,
      daysAbsent:    daysAbsent,
      hoursWorked:   Number(hoursAgg._sum.hoursWorked ?? 0),
      overtimeHours: Number(overtimeAgg._sum.overtimeHours ?? 0),
    },
    myLatestPayslip: null, // Payslip model doesn't have guardId field - unable to query
    myOpenTasks: myOpenTasks.map(t => ({ ...t, dueDate: t.dueDate.toISOString() })),
    myUpcomingPatrols: myUpcomingPatrols.map(p => ({
      siteName:      siteMap[p.siteId] ?? 'Unknown',
      scheduledTime: p.scheduledTime.toISOString(),
      status:        p.status,
    })),
    myPendingLeave,
  })
}
