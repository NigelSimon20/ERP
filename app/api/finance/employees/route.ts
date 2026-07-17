import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session

  // Get fiscal year start from company settings
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { fiscalYearStart: true } })
  const now = new Date()
  const fiscalMonthStr = company?.fiscalYearStart ?? '01-01'
  const [monthStr, dayStr] = fiscalMonthStr.split('-')
  const fiscalMonth = parseInt(monthStr, 10)
  const fiscalDay = parseInt(dayStr, 10)
  const fiscalStart = new Date(now.getFullYear(), fiscalMonth - 1, fiscalDay)
  if (fiscalStart > now) fiscalStart.setFullYear(fiscalStart.getFullYear() - 1)

  const guards = await prisma.guard.findMany({
    where: { companyId, status: 'Active' },
    select: { id: true, employee_code: true, first_name: true, last_name: true, department: true, daily_rate: true },
    orderBy: { last_name: 'asc' },
  })

  // YTD cost per guard from payslips (limited data available - using employee_id as proxy)
  const ytdPayslips = await prisma.payslip.groupBy({
    by: ['employee_id'],
    where: {
      status: 'Approved',
      created_date: { gte: fiscalStart.toISOString().split('T')[0] },
    },
    _sum: { net_pay: true, total_earnings: true },
    _count: { id: true },
    _max: { created_date: true },
  })

  const payslipMap = Object.fromEntries(ytdPayslips.map((p) => [p.employee_id, p]))

  // Most recent payslip amount
  const recentPayslips = await prisma.payslip.findMany({
    where: { status: 'Approved' },
    orderBy: { created_date: 'desc' },
    distinct: ['employee_id'],
    select: { employee_id: true, net_pay: true, created_date: true },
  })
  const recentMap = Object.fromEntries(recentPayslips.map((p) => [p.employee_id, p]))

  // Hours YTD
  const hoursYtd = await prisma.attendance.groupBy({
    by: ['guardId'],
    where: { date: { gte: fiscalStart } },
    _sum: { hoursWorked: true },
  })
  const hoursMap = Object.fromEntries(hoursYtd.map((h) => [h.guardId, Number(h._sum.hoursWorked ?? 0)]))

  const employees = guards.map((g) => {
    // Payslip.employee_id is set to the guard's id at creation time (see
    // app/api/hr/payroll/route.ts), not employee_code -- must key by g.id.
    return {
      ...g,
      dailyRate: Number(g.daily_rate ?? 0),
      ytdCost: Number(payslipMap[g.id]?._sum.net_pay ?? 0),
      ytdGross: Number(payslipMap[g.id]?._sum.total_earnings ?? 0),
      payslipCount: payslipMap[g.id]?._count.id ?? 0,
      lastPayslipAmount: recentMap[g.id] ? Number((recentMap[g.id] as { net_pay: number }).net_pay) : 0,
      lastPayslipDate: recentMap[g.id]?.created_date ?? null,
      totalHoursYTD: hoursMap[g.id] ?? 0,
    }
  })

  const totalPayrollCostYTD = employees.reduce((s, e) => s + e.ytdCost, 0)
  const totalHoursYTD = employees.reduce((s, e) => s + e.totalHoursYTD, 0)
  const avgMonthlyCost = employees.length > 0 ? totalPayrollCostYTD / Math.max(1, now.getMonth() - fiscalStart.getMonth() + 1) / employees.length : 0

  return NextResponse.json({ employees, totalHeadcount: employees.length, totalPayrollCostYTD, totalHoursYTD, avgMonthlyCostPerEmployee: avgMonthlyCost })
}
