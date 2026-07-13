import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

function round2dp(n: number) {
  return Math.round(n * 100) / 100
}

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') ?? new Date().getFullYear())

  const budgets = await prisma.budget.findMany({ where: { companyId, year } })

  // Actuals: sum posted journal-line movement for EXPENSE accounts tagged
  // with a department, bucketed by month, for the requested year.
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)

  const [deptExpenseAccounts, postedEntries] = await Promise.all([
    prisma.chartOfAccount.findMany({
      where: { companyId, account_type: 'EXPENSE', department: { not: null } },
      select: { id: true, department: true },
    }),
    prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', entry_date: { gte: yearStart.toISOString(), lte: yearEnd.toISOString() } },
      select: { id: true, entry_date: true },
    }),
  ])

  const entryMonthMap = Object.fromEntries(
    postedEntries.map((e) => [e.id, e.entry_date ? new Date(e.entry_date).getMonth() + 1 : null]),
  )
  const accountDeptMap = Object.fromEntries(deptExpenseAccounts.map((a) => [a.id, a.department]))

  const actualByDeptMonth: Record<string, number> = {}
  if (deptExpenseAccounts.length && postedEntries.length) {
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: { in: deptExpenseAccounts.map((a) => a.id) },
        journalEntryId: { in: postedEntries.map((e) => e.id) },
      },
      select: { accountId: true, journalEntryId: true, debit: true, credit: true },
    })
    for (const line of lines) {
      const dept = accountDeptMap[line.accountId]
      const month = entryMonthMap[line.journalEntryId]
      if (!dept || !month) continue
      const key = `${dept}:${month}`
      actualByDeptMonth[key] = (actualByDeptMonth[key] ?? 0) + (Number(line.debit) - Number(line.credit))
    }
  }

  const result = budgets.map((b) => {
    const actualAmount = round2dp(actualByDeptMonth[`${b.department}:${b.month}`] ?? 0)
    const budgetedAmount = Number(b.budgetedAmount)
    return {
      id: b.id,
      department: b.department,
      month: b.month,
      year: b.year,
      budgetedAmount,
      actualAmount,
      variance: round2dp(budgetedAmount - actualAmount),
    }
  })

  return NextResponse.json({ budgets: result })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name } = session
  const body = await req.json()
  const { department, month, year, budgetedAmount } = body

  if (!department || !month || !year || budgetedAmount === undefined) {
    return NextResponse.json({ error: 'department, month, year, budgetedAmount are required' }, { status: 400 })
  }
  if (Number(month) < 1 || Number(month) > 12) {
    return NextResponse.json({ error: 'month must be between 1 and 12' }, { status: 400 })
  }
  if (Number(budgetedAmount) < 0) {
    return NextResponse.json({ error: 'budgetedAmount cannot be negative' }, { status: 400 })
  }

  const budget = await prisma.budget.upsert({
    where: { companyId_department_month_year: { companyId, department, month: Number(month), year: Number(year) } },
    create: {
      id: crypto.randomUUID(),
      companyId,
      department,
      month: Number(month),
      year: Number(year),
      budgetedAmount: Number(budgetedAmount),
    },
    update: { budgetedAmount: Number(budgetedAmount) },
  })

  await logAudit({
    companyId, userId, userName: name,
    action: 'CREATE', module: 'Budgets', recordId: budget.id,
    newValues: { department, month, year, budgetedAmount },
  })

  return NextResponse.json({ budget }, { status: 201 })
}
