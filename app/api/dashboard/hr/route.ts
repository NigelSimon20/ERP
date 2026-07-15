import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(today.getTime() + 86_400_000)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const sevenDaysOut = new Date(today.getTime() + 7 * 86_400_000)

  const [guardIds] = await Promise.all([
    prisma.guard.findMany({ where: { companyId }, select: { id: true } }).then(r => r.map(x => x.id)),
  ])

  const [
    totalEmployees, activeEmployees, suspendedEmployees,
    guardsWithHireDate, pendingLeave, approvedLeaveThisMonth,
    onLeaveToday, lastPayroll,
    presentMonth, totalAttendanceMonth, overtimeAgg,
    departmentGroups, leaveTypeGroups,
    recentLeave, upcomingBirthdays,
  ] = await Promise.all([
    prisma.guard.count({ where: { companyId } }),
    prisma.guard.count({ where: { companyId, status: 'ACTIVE' } }),
    prisma.guard.count({ where: { companyId, status: 'SUSPENDED' } }),
    // hire_date is a free-text String column (not DateTime, and not
    // guaranteed to be in one consistent format given this data's import
    // history), so the month filter happens in JS after fetching — same
    // approach already used below for upcomingBirthdays.
    prisma.guard.findMany({
      where: { companyId, hire_date: { not: null } },
      select: { hire_date: true },
    }),
    prisma.leaveRequest.count({ where: { companyId, status: 'PENDING' } }),
    prisma.leaveRequest.count({ where: { companyId, status: 'APPROVED', startDate: { gte: monthStart } } }),
    prisma.attendance.count({ where: { guardId: { in: guardIds }, date: { gte: today, lt: todayEnd }, status: 'LEAVE' } }),
    prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { totalGross: true, totalNet: true, periodStart: true, periodEnd: true, status: true } }),
    prisma.attendance.count({ where: { guardId: { in: guardIds }, date: { gte: monthStart }, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { guardId: { in: guardIds }, date: { gte: monthStart } } }),
    prisma.attendance.aggregate({ where: { guardId: { in: guardIds }, date: { gte: monthStart } }, _sum: { overtimeHours: true } }),
    prisma.guard.groupBy({ by: ['department'], where: { companyId, status: 'ACTIVE', department: { not: null } }, _count: { _all: true } }),
    prisma.leaveRequest.groupBy({ by: ['leaveType'], where: { companyId }, _count: { _all: true } }),
    prisma.leaveRequest.findMany({
      where: { companyId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, guardId: true, leaveType: true, startDate: true, endDate: true, days: true },
    }),
    prisma.guard.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        date_of_birth: { not: null },
      },
      select: { id: true, full_name: true, date_of_birth: true, department: true },
    }),
  ])

  const guardNameMap = Object.fromEntries(
    await prisma.guard.findMany({ where: { id: { in: recentLeave.map(l => l.guardId) } }, select: { id: true, full_name: true } }).then(r => r.map(g => [g.id, g.full_name]))
  )

  // Filter upcoming birthdays in next 7 days (month/day only)
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const endMD   = `${String(sevenDaysOut.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysOut.getDate()).padStart(2, '0')}`
  const birthdayGuards = upcomingBirthdays.filter(g => {
    if (!g.date_of_birth) return false
    const dobDate = new Date(g.date_of_birth)
    const md = `${String(dobDate.getMonth() + 1).padStart(2, '0')}-${String(dobDate.getDate()).padStart(2, '0')}`
    return md >= todayMD && md <= endMD
  })

  const attendanceRate = totalAttendanceMonth > 0 ? Math.round((presentMonth / totalAttendanceMonth) * 100) : 0

  const newHiresThisMonth = guardsWithHireDate.filter(g => {
    if (!g.hire_date) return false
    const hired = new Date(g.hire_date)
    if (isNaN(hired.getTime())) return false
    return hired.getFullYear() === now.getFullYear() && hired.getMonth() === now.getMonth()
  }).length

  return NextResponse.json({
    totalEmployees,
    activeEmployees,
    suspendedEmployees,
    newHiresThisMonth,
    pendingLeave,
    approvedLeaveThisMonth,
    onLeaveToday,
    attendanceRate,
    overtimeHours: Number(overtimeAgg._sum.overtimeHours ?? 0),
    lastPayroll: lastPayroll ? {
      periodStart: lastPayroll.periodStart.toISOString(),
      periodEnd:   lastPayroll.periodEnd.toISOString(),
      totalGross:  Number(lastPayroll.totalGross),
      totalNet:    Number(lastPayroll.totalNet),
      status:      lastPayroll.status,
    } : null,
    departmentHeadcount: departmentGroups.map(g => ({ department: g.department ?? 'Unknown', count: g._count._all })),
    leaveByType:         leaveTypeGroups.map(g => ({ leaveType: g.leaveType, count: g._count._all })),
    recentLeaveRequests: recentLeave.map(l => ({
      id:            l.id,
      guardId:       l.guardId,
      guardName:     guardNameMap[l.guardId] ?? 'Unknown',
      leaveType:     l.leaveType,
      startDate:     l.startDate.toISOString(),
      endDate:       l.endDate.toISOString(),
      daysRequested: l.days,
    })),
    upcomingBirthdays: birthdayGuards.map(g => ({
      name:       g.full_name ?? 'Unknown',
      birthday:   new Date(g.date_of_birth!).toISOString(),
      department: g.department ?? 'Unknown',
    })),
  })
}
