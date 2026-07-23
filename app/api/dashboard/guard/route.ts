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
    latestPayslip, myOpenTasks, myUpcomingPatrols, myPendingLeave,
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
    // Payslip has no formal relation to Guard, but `employee_id` is
    // populated with the guard's id (see app/api/hr/payroll/route.ts,
    // which already relies on this same mapping).
    prisma.payslip.findFirst({
      where: { employee_id: guardId },
      orderBy: { pay_date: 'desc' },
      select: { net_pay: true, payroll_run_id: true, period: true, pay_date: true },
    }),
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
  }

  // Resolve site names for patrols
  const patrolSiteIds = Array.from(new Set(myUpcomingPatrols.map(p => p.siteId)))
  const patrolSites = await prisma.site.findMany({ where: { id: { in: patrolSiteIds } }, select: { id: true, site_name: true } })
  const siteMap = Object.fromEntries(patrolSites.map(s => [s.id, s.site_name]))

  // Resolve the payslip's period from its linked PayrollRun where one
  // exists (Payslip itself has no periodStart/periodEnd — only a
  // payroll_run_id scalar reference). Most payslips in this dataset were
  // never linked to a PayrollRun, so fall back to the payslip's own
  // `period` ("YYYY-MM") or `pay_date` rather than silently hiding a real
  // payslip just because the run link is missing.
  let myLatestPayslip: { netPay: number; periodStart: string; periodEnd: string } | null = null
  if (latestPayslip) {
    let periodStart: string | null = null
    let periodEnd: string | null = null
    if (latestPayslip.payroll_run_id) {
      const run = await prisma.payrollRun.findUnique({
        where: { id: latestPayslip.payroll_run_id },
        select: { periodStart: true, periodEnd: true },
      })
      if (run) {
        periodStart = run.periodStart.toISOString()
        periodEnd = run.periodEnd.toISOString()
      }
    }
    if (!periodStart && latestPayslip.period && /^\d{4}-\d{2}$/.test(latestPayslip.period)) {
      const [year, month] = latestPayslip.period.split('-').map(Number)
      periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString()
      periodEnd = new Date(Date.UTC(year, month, 0)).toISOString()
    }
    if (!periodStart && latestPayslip.pay_date) {
      periodStart = new Date(latestPayslip.pay_date).toISOString()
      periodEnd = periodStart
    }
    myLatestPayslip = {
      netPay: Number(latestPayslip.net_pay ?? 0),
      periodStart: periodStart ?? new Date().toISOString(),
      periodEnd: periodEnd ?? new Date().toISOString(),
    }
  }

  return NextResponse.json({
    // The Guard model's real columns (full_name/position/employee_code) —
    // the frontend expects name/rank/employeeNumber, so map them here
    // instead of leaking raw Prisma field names to the client.
    myProfile: myProfile ? {
      name: myProfile.full_name ?? 'Guard',
      rank: myProfile.position,
      department: myProfile.department,
      employeeNumber: myProfile.employee_code ?? '',
      status: myProfile.status ?? '',
    } : null,
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
    myLatestPayslip,
    myOpenTasks: myOpenTasks.map(t => ({ ...t, dueDate: t.dueDate.toISOString() })),
    myUpcomingPatrols: myUpcomingPatrols.map(p => ({
      siteName:      siteMap[p.siteId] ?? 'Unknown',
      scheduledTime: p.scheduledTime.toISOString(),
      status:        p.status,
    })),
    myPendingLeave,
  })
}
