import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DB_STATUS_OUTSTANDING, DB_STATUS_VOID } from '@/lib/invoice-status'

function monthKey(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function buildMonthlyChart(
  receipts: { receiptDate: Date; amount: unknown }[],
  payments: { paymentDate: Date; amount: unknown }[]
) {
  const buckets: { month: string; revenue: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    buckets.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), revenue: 0, expenses: 0 })
  }
  receipts.forEach(r => {
    const b = buckets.find(b => b.month === monthKey(r.receiptDate))
    if (b) b.revenue += Number(r.amount)
  })
  payments.forEach(p => {
    const b = buckets.find(b => b.month === monthKey(p.paymentDate))
    if (b) b.expenses += Number(p.amount)
  })
  return buckets
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const fiscalStart = new Date(now.getFullYear(), 0, 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(today.getTime() + 86_400_000)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  // Site has no companyId column (single-tenant deployment: all sites belong
  // to this company), so incident/site queries need no company filter.
  // Guard *does* have companyId — attendance is scoped via the guard relation.
  const [
    revenueAgg, outstandingAgg, expensesAgg, bankAgg,
    activeGuards, activeSites, openIncidents, criticalIncidents,
    guardsOnDutyToday, pendingTasks, overdueInvoices, lastPayroll,
    rawReceipts, rawPayments, incidentGroups, allActiveSites, recentActivity,
  ] = await Promise.all([
    prisma.salesInvoice.aggregate({ where: { invoice_date: { gte: fiscalStart.toISOString().split('T')[0] }, status: { not: DB_STATUS_VOID } }, _sum: { total_amount: true } }),
    prisma.salesInvoice.aggregate({ where: { status: { in: DB_STATUS_OUTSTANDING } }, _sum: { balance_due: true } }),
    prisma.payment.aggregate({ where: { payment_type: { not: 'Customer Receipt' }, payment_date: { gte: fiscalStart.toISOString().split('T')[0] } }, _sum: { amount: true } }),
    prisma.bankAccount.aggregate({ where: { is_active: true }, _sum: { current_balance: true } }),
    prisma.guard.count({ where: { companyId, status: 'Active' } }),
    prisma.site.count({ where: { status: 'Active' } }),
    prisma.incident.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    prisma.incident.count({ where: { severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
    prisma.attendance.count({ where: { guard: { companyId }, date: { gte: today, lt: todayEnd }, status: 'PRESENT' } }),
    prisma.task.count({ where: { companyId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    prisma.salesInvoice.count({ where: { status: { in: DB_STATUS_OUTSTANDING }, due_date: { lt: now.toISOString() }, balance_due: { gt: 0 } } }),
    prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { totalNet: true, periodStart: true, periodEnd: true } }),
    prisma.payment.findMany({ where: { companyId, payment_type: 'Customer Receipt', payment_date: { gte: sixMonthsAgo.toISOString().split('T')[0] } }, select: { payment_date: true, amount: true } }),
    prisma.payment.findMany({ where: { payment_type: { not: 'Customer Receipt' }, payment_date: { gte: sixMonthsAgo.toISOString().split('T')[0] } }, select: { payment_date: true, amount: true } }),
    prisma.incident.groupBy({ by: ['severity'], _count: { _all: true } }),
    prisma.site.findMany({
      where: { status: 'Active' },
      select: { id: true, site_name: true, status: true, billing_rate_day: true, billing_rate_night: true, day_shift_assigned: true, night_shift_assigned: true },
    }),
    prisma.auditTrail.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true, module: true, userName: true, createdAt: true, recordId: true } }),
  ])

  // Monthly contract value estimate from real billing-rate + shift-assignment
  // columns (Site has no invoice/contract-value field to read directly).
  const sitesWithValue = allActiveSites.map(s => ({
    id: s.id,
    name: s.site_name ?? 'Unnamed site',
    status: s.status,
    monthlyValue:
      (s.billing_rate_day ?? 0) * (s.day_shift_assigned ?? 0) * 30 +
      (s.billing_rate_night ?? 0) * (s.night_shift_assigned ?? 0) * 30,
  }))
  const topSites = sitesWithValue.sort((a, b) => b.monthlyValue - a.monthlyValue).slice(0, 5)

  // Guard counts per site
  const siteGuardCounts = await prisma.deployment.groupBy({
    by: ['siteId'],
    where: { siteId: { in: topSites.map(s => s.id) }, status: 'ACTIVE' },
    _count: { _all: true },
  })
  const guardCountMap = Object.fromEntries(siteGuardCounts.map(r => [r.siteId, r._count._all]))

  return NextResponse.json({
    totalRevenue:           Number(revenueAgg._sum.total_amount ?? 0),
    outstandingReceivables: Number(outstandingAgg._sum.balance_due ?? 0),
    totalExpenses:          Number(expensesAgg._sum.amount ?? 0),
    cashInBank:             Number(bankAgg._sum.current_balance ?? 0),
    activeGuards,
    activeSites,
    openIncidents,
    criticalIncidents,
    guardsOnDutyToday,
    pendingTasks,
    overdueInvoices,
    lastPayroll: lastPayroll ? {
      totalNet:    Number(lastPayroll.totalNet),
      periodStart: lastPayroll.periodStart.toISOString(),
      periodEnd:   lastPayroll.periodEnd.toISOString(),
    } : null,
    monthlyChart: buildMonthlyChart(
      rawReceipts.map(r => ({ receiptDate: new Date(r.payment_date!), amount: r.amount })),
      rawPayments.map(p => ({ paymentDate: new Date(p.payment_date!), amount: p.amount }))
    ),
    incidentsBySeverity: incidentGroups.map(g => ({ severity: g.severity, count: g._count._all })),
    topSites: topSites.map(s => ({
      name:          s.name,
      revenue:       s.monthlyValue,
      guards:        guardCountMap[s.id] ?? 0,
      status:        s.status,
    })),
    recentActivity: recentActivity.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
  })
}
