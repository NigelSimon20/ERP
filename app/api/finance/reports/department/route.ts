import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

function round2dp(n: number) {
  return Math.round(n * 100) / 100
}

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const department = searchParams.get('department') || 'All'
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })

  const from = new Date(startDate)
  const to = new Date(`${endDate}T23:59:59.999`)

  const deptFilter = department === 'All' ? { not: null } : department

  const [revAccounts, expAccounts, postedEntries, guards] = await Promise.all([
    prisma.chartOfAccount.findMany({
      where: { companyId, account_type: 'REVENUE', department: deptFilter as any },
      select: { id: true, account_name: true },
    }),
    prisma.chartOfAccount.findMany({
      where: { companyId, account_type: 'EXPENSE', department: deptFilter as any },
      select: { id: true, account_name: true },
    }),
    prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', entry_date: { gte: from.toISOString(), lte: to.toISOString() } },
      select: { id: true },
    }),
    prisma.guard.findMany({
      where: { companyId, status: 'Active', ...(department === 'All' ? {} : { department }) },
      select: { id: true },
    }),
  ])

  const entryIds = postedEntries.map((e) => e.id)
  const accountIds = [...revAccounts.map((a) => a.id), ...expAccounts.map((a) => a.id)]

  const lineAggs = accountIds.length && entryIds.length
    ? await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: accountIds }, journalEntryId: { in: entryIds } },
        _sum: { debit: true, credit: true },
      })
    : []
  const lineMap = Object.fromEntries(lineAggs.map((l) => [l.accountId, l._sum]))

  const totalRevenue = round2dp(
    revAccounts.reduce((s, a) => s + (Number(lineMap[a.id]?.credit ?? 0) - Number(lineMap[a.id]?.debit ?? 0)), 0),
  )
  const expenseLineItems = expAccounts
    .map((a) => ({ category: a.account_name ?? 'Unnamed', amount: round2dp(Number(lineMap[a.id]?.debit ?? 0) - Number(lineMap[a.id]?.credit ?? 0)) }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
  const totalExpenses = round2dp(expenseLineItems.reduce((s, l) => s + l.amount, 0))

  const guardIds = guards.map((g) => g.id)
  const payrollRuns = await prisma.payrollRun.findMany({
    where: { companyId, periodStart: { lte: to }, periodEnd: { gte: from } },
    select: { id: true },
  })
  const payslipAgg = guardIds.length && payrollRuns.length
    ? await prisma.payslip.aggregate({
        where: { employee_id: { in: guardIds }, payroll_run_id: { in: payrollRuns.map((r) => r.id) } },
        _sum: { total_earnings: true },
      })
    : null
  const payrollCost = round2dp(Number(payslipAgg?._sum.total_earnings ?? 0))

  const netContribution = round2dp(totalRevenue - totalExpenses)
  const payrollPct = totalExpenses > 0 ? round2dp((payrollCost / totalExpenses) * 100) : 0

  return NextResponse.json({
    report: {
      department,
      period: `${startDate} to ${endDate}`,
      totalRevenue,
      totalExpenses,
      netContribution,
      headcount: guards.length,
      payrollCost,
      payrollPct,
      lineItems: expenseLineItems,
    },
  })
}
