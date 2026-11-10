import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DB_STATUS_OUTSTANDING, DB_STATUS_VOID } from '@/lib/invoice-status'
import { overdueQueryCutoff, calculateWorkingCapital, calculateCurrentRatio } from '@/lib/calculations'
import { buildCurrencyConverter, listAvailableCurrencies } from '@/lib/currency'
import { computeBalanceSheet } from '@/lib/balance-sheet'
import { getReceivables } from '@/lib/reports/subledger'
import { incomeStatement, companyFiscalYearStart } from '@/lib/reports/ledger'

function monthKey(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function buildMonthlyChart(receipts: { date: Date; amount: number }[], payments: { date: Date; amount: number }[]) {
  const buckets: { month: string; revenue: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    buckets.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), revenue: 0, expenses: 0 })
  }
  receipts.forEach((r) => {
    const b = buckets.find((b) => b.month === monthKey(r.date))
    if (b) b.revenue += r.amount
  })
  payments.forEach((p) => {
    const b = buckets.find((b) => b.month === monthKey(p.date))
    if (b) b.expenses += p.amount
  })
  return buckets
}

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const fiscalStart = await companyFiscalYearStart(prisma, session.companyId, now)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(today.getTime() + 86_400_000)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true } })
  const reportingCurrency = company?.currency || 'USD'

  const { searchParams } = new URL(req.url)
  const requestedCurrency = searchParams.get('currency')
  const viewCurrency = requestedCurrency || reportingCurrency
  const isNative = viewCurrency !== reportingCurrency

  const [availableCurrencies, convert] = await Promise.all([
    listAvailableCurrencies(companyId, reportingCurrency),
    isNative ? Promise.resolve(null) : buildCurrencyConverter(reportingCurrency, now),
  ])

  let excludedCount = 0
  function amt(value: unknown, currency: string | null): number | null {
    const n = Number(value ?? 0)
    if (isNative) return currency === viewCurrency ? n : null
    const { amount, converted } = convert!(n, currency)
    if (!converted) excludedCount++
    return converted ? amount : null
  }

  const [
    invoicesForRevenue, outstandingInvoices, allPayments, bankAccounts,
    activeGuards, activeSites, openIncidents, criticalIncidents,
    guardsOnDutyToday, pendingTasks, overdueInvoices, lastPayroll,
    incidentGroups, allActiveSites, recentActivity, balanceSheet, contractAgg,
  ] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { companyId, invoice_date: { gte: fiscalStart.toISOString().split('T')[0] }, status: { not: DB_STATUS_VOID } },
      select: { total_amount: true, currency: true },
    }),
    prisma.salesInvoice.findMany({
      where: { companyId, status: { in: DB_STATUS_OUTSTANDING } },
      select: { balance_due: true, currency: true },
    }),
    prisma.payment.findMany({
      where: { companyId, payment_date: { gte: sixMonthsAgo.toISOString().split('T')[0] } },
      select: { payment_date: true, amount: true, currency: true, payment_type: true },
    }),
    prisma.bankAccount.findMany({ where: { companyId, is_active: true }, select: { current_balance: true, currency: true, account_type: true } }),
    prisma.guard.count({ where: { companyId, status: 'Active' } }),
    prisma.site.count({ where: { companyId, status: 'Active' } }),
    prisma.incident.count({ where: { companyId, status: { in: ['OPEN', 'INVESTIGATING'] } } }),
    prisma.incident.count({ where: { companyId, severity: 'CRITICAL', status: { not: 'CLOSED' } } }),
    prisma.attendance.count({ where: { guard: { companyId }, date: { gte: today, lt: todayEnd }, status: 'PRESENT' } }),
    prisma.task.count({ where: { companyId, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
    prisma.salesInvoice.count({ where: { companyId, status: { in: DB_STATUS_OUTSTANDING }, due_date: { lt: overdueQueryCutoff(now).toISOString() }, balance_due: { gt: 0 } } }),
    prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { totalNet: true, periodStart: true, periodEnd: true } }),
    prisma.incident.groupBy({ by: ['severity'], where: { companyId }, _count: { _all: true } }),
    prisma.site.findMany({
      where: { companyId, status: 'Active' },
      select: { id: true, site_name: true, status: true, billing_rate_day: true, billing_rate_night: true, day_shift_assigned: true, night_shift_assigned: true },
    }),
    prisma.auditTrail.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 10, select: { action: true, module: true, userName: true, createdAt: true, recordId: true } }),
    computeBalanceSheet(prisma, companyId, now),
    prisma.contract.aggregate({ where: { companyId, status: 'ACTIVE' }, _sum: { contractValue: true }, _count: true }),
  ])

  let totalRevenue = 0
  invoicesForRevenue.forEach((inv) => {
    const v = amt(inv.total_amount, inv.currency)
    if (v !== null) totalRevenue += v
  })

  let outstandingReceivables = 0
  outstandingInvoices.forEach((inv) => {
    const v = amt(inv.balance_due, inv.currency)
    if (v !== null) outstandingReceivables += v
  })

  let totalExpenses = 0
  let cashIn = 0
  const chartReceipts: { date: Date; amount: number }[] = []
  const chartPayments: { date: Date; amount: number }[] = []
  allPayments.forEach((p) => {
    if (!p.payment_date) return
    const v = amt(p.amount, p.currency)
    if (v === null) return
    if (p.payment_type === 'Customer Receipt') {
      chartReceipts.push({ date: new Date(p.payment_date), amount: v })
      cashIn += v
    } else {
      chartPayments.push({ date: new Date(p.payment_date), amount: v })
      totalExpenses += v
    }
  })

  let cashInBank = 0
  let pettyCash = 0
  bankAccounts.forEach((b) => {
    const v = amt(b.current_balance, b.currency)
    if (v === null) return
    cashInBank += v
    if ((b.account_type ?? '').toLowerCase().includes('petty')) pettyCash += v
  })

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

  const [ledgerIS, receivables] = await Promise.all([
    incomeStatement(prisma, companyId, fiscalStart, now),
    getReceivables(prisma, companyId),
  ])

  // Guard counts per site
  const siteGuardCounts = await prisma.deployment.groupBy({
    by: ['siteId'],
    where: { siteId: { in: topSites.map(s => s.id) }, status: 'ACTIVE' },
    _count: { _all: true },
  })
  const guardCountMap = Object.fromEntries(siteGuardCounts.map(r => [r.siteId, r._count._all]))

  return NextResponse.json({
    reportingCurrency,
    viewCurrency,
    availableCurrencies,
    excludedCount: isNative ? 0 : excludedCount,
    // Same sources as the finance dashboard and the Income Statement (P1-2/P1-4).
    totalRevenue: isNative ? totalRevenue : Number(ledgerIS.totalRevenue),
    outstandingReceivables: isNative ? outstandingReceivables : Number(receivables.total),
    totalExpenses: isNative ? totalExpenses : Number(ledgerIS.totalExpenses),
    netProfit: Number(ledgerIS.netProfit),
    cashIn,
    cashInBank,
    pettyCash,
    totalBankAccounts: bankAccounts.length,
    ratios: {
      workingCapital: calculateWorkingCapital(balanceSheet.currentAssets, balanceSheet.currentLiabilities),
      currentRatio: calculateCurrentRatio(balanceSheet.currentAssets, balanceSheet.currentLiabilities),
    },
    contractRevenue: {
      totalActiveValue: Number(contractAgg._sum.contractValue ?? 0),
      activeCount: contractAgg._count,
    },
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
    monthlyChart: buildMonthlyChart(chartReceipts, chartPayments),
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
