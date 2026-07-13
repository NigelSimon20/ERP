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

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const status = searchParams.get('status')
  const { companyId } = session
  const periodStartFilter = year
    ? {
        gte: new Date(Number(year), month ? Number(month) - 1 : 0, 1),
        lte: new Date(Number(year), month ? Number(month) : 12, 0),
      }
    : undefined

  const where: any = {
    companyId,
    ...(status && { status }),
    ...(periodStartFilter && { periodStart: periodStartFilter }),
  }

  const runs = await prisma.payrollRun.findMany({
    where,
    orderBy: { runDate: 'desc' },
  })

  const processedByIds = Array.from(
    new Set(runs.map((run) => run.processedBy).filter((id): id is string => Boolean(id))),
  )
  const bankAccountIds = Array.from(
    new Set(runs.map((run) => run.bankAccountId).filter((id): id is string => Boolean(id))),
  )

  const [users, bankAccounts] = await Promise.all([
    processedByIds.length
      ? prisma.user.findMany({ where: { id: { in: processedByIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    bankAccountIds.length
      ? prisma.bankAccount.findMany({ where: { id: { in: bankAccountIds } }, select: { id: true, bank_name: true, account_number: true } })
      : Promise.resolve([]),
  ])

  const userMap = Object.fromEntries(users.map((user) => [user.id, user]))
  const bankAccountMap = Object.fromEntries(bankAccounts.map((account) => [account.id, account]))

  const runIds = runs.map((run) => run.id)
  const payslipCounts = runIds.length
    ? await prisma.payslip.groupBy({ by: ['payroll_run_id'], where: { payroll_run_id: { in: runIds } }, _count: { id: true } })
    : []
  const payslipCountMap = Object.fromEntries(payslipCounts.map((p) => [p.payroll_run_id, p._count.id]))

  // Aggregates
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { fiscalYearStart: true } })
  const fiscalMonth = Number(company?.fiscalYearStart?.split('-')[0] ?? '1')
  const fiscalStart = new Date(now.getFullYear(), fiscalMonth - 1, 1)
  if (fiscalStart > now) fiscalStart.setFullYear(fiscalStart.getFullYear() - 1)

  const [thisMonthAgg, thisYearAgg] = await Promise.all([
    prisma.payrollRun.aggregate({ where: { companyId, runDate: { gte: monthStart } }, _sum: { totalNet: true } }),
    prisma.payrollRun.aggregate({ where: { companyId, runDate: { gte: fiscalStart } }, _sum: { totalNet: true } }),
  ])

  const guardsOnLastRun = runs.length > 0 ? (payslipCountMap[runs[0].id] ?? 0) : 0

  const avgNetPay = runs.length > 0
    ? runs.reduce((s, r) => s + Number(r.totalNet ?? 0), 0) / Math.max(1, runs.length)
    : 0

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      runDate: r.runDate,
      payPeriodStart: r.periodStart,
      payPeriodEnd: r.periodEnd,
      status: r.status,
      totalGross: Number(r.totalGross ?? 0),
      totalDeductions: Number(r.totalDeductions ?? 0),
      totalNet: Number(r.totalNet ?? 0),
      payslipCount: payslipCountMap[r.id] ?? 0,
      processedByUser: userMap[r.processedBy]
        ? { name: userMap[r.processedBy].name }
        : null,
      bankAccount: r.bankAccountId && bankAccountMap[r.bankAccountId]
        ? {
            bankName: bankAccountMap[r.bankAccountId].bank_name ?? '',
            accountNumber: bankAccountMap[r.bankAccountId].account_number ?? '',
          }
        : null,
    })),
    thisMonthTotal: Number(thisMonthAgg._sum.totalNet ?? 0),
    thisYearTotal: Number(thisYearAgg._sum.totalNet ?? 0),
    avgNetPayPerGuard: avgNetPay,
    guardsOnLastRun,
  })
}
