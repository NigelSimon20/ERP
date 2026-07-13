import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'

export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)

  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { companyId } = session

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { fiscalYearStart: true },
  })

  const now = new Date()
  const rawFyMonth = company?.fiscalYearStart ?? '01-01'
  const fyMonth = Number(rawFyMonth.split('-')[0]) || 1
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const fiscalStart =
    currentMonth >= fyMonth
      ? new Date(currentYear, fyMonth - 1, 1)
      : new Date(currentYear - 1, fyMonth - 1, 1)

  const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  // Group 1 — invoice aggregates
  const [revenueAgg, receivablesAgg] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: { status: { not: 'VOID' }, invoice_date: { gte: fiscalStart.toISOString().split('T')[0] } },
      _sum: { total_amount: true },
    }),
    prisma.salesInvoice.aggregate({
      where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
      _sum: { balance_due: true },
    }),
  ])

  // Group 2 — entity counts
  const [activeGuards, activeSites, openIncidents] = await Promise.all([
    prisma.guard.count({ where: { companyId, status: 'ACTIVE' } }),
    prisma.site.count({ where: { status: 'ACTIVE' } }),
    prisma.incident.count({
      where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
    }),
  ])

  // Group 3 — payroll, chart data, incident breakdown
  const [lastPayrollCost, receiptsRaw, paymentsRaw, incidentsBySeverity] = await Promise.all([
    prisma.payrollRun.findFirst({
      where: { companyId, status: 'CONFIRMED' },
      orderBy: { runDate: 'desc' },
      select: { totalNet: true, periodStart: true, periodEnd: true },
    }),
    prisma.receipt.findMany({
      where: { companyId, receiptDate: { gte: sixMonthsStart } },
      select: { amount: true, receiptDate: true },
    }),
    prisma.payment.findMany({
      where: { payment_date: { gte: sixMonthsStart.toISOString().split('T')[0] } },
      select: { amount: true, payment_date: true },
    }),
    prisma.incident.groupBy({
      by: ['severity'],
      where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
      _count: { severity: true },
    }),
  ])

  // Group 4 — attendance counts (separated to avoid TS tuple inference issues)
  const [attendancePresent, attendanceTotal] = await Promise.all([
    prisma.attendance.count({
      where: {
        guard: { companyId },
        status: 'PRESENT',
        date: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
    prisma.attendance.count({
      where: {
        guard: { companyId },
        date: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
  ])

  const recentActivity = await prisma.auditTrail.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, module: true, userName: true, createdAt: true, recordId: true },
  })

  // Build 6-month chart series (oldest → newest)
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - (5 - i), 1),
  )

  const monthlyChart = months.map((monthDate) => {
    const start = monthDate
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999)
    const revenue = receiptsRaw
      .filter((r) => r.receiptDate >= start && r.receiptDate <= end)
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0)
    const expenses = paymentsRaw
      .filter((p) => p.payment_date && new Date(p.payment_date) >= start && new Date(p.payment_date) <= end)
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0)
    return { month: format(monthDate, 'MMM'), revenue, expenses }
  })

  const attendanceRate =
    attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0

  return NextResponse.json({
    totalRevenue: Number(revenueAgg._sum.total_amount ?? 0),
    outstandingReceivables: Number(receivablesAgg._sum.balance_due ?? 0),
    activeGuards,
    activeSites,
    openIncidents,
    lastPayrollCost: lastPayrollCost
      ? {
          totalNet: Number(lastPayrollCost.totalNet),
          periodStart: lastPayrollCost.periodStart,
          periodEnd: lastPayrollCost.periodEnd,
        }
      : null,
    monthlyChart,
    incidentsBySeverity: incidentsBySeverity.map((row) => ({
      severity: row.severity,
      count: row._count.severity,
    })),
    attendanceRate,
    recentActivity: recentActivity.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  })
}
