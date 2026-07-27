import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { round2dp } from '@/lib/calculations'
import { buildCurrencyConverter } from '@/lib/currency'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

function monthKey(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// Bank-account-focused report: (a) per-account balance summary, (b)
// reconciliation status per account, (c) cash movement by month across all
// accounts — assembled here rather than reusing app/api/finance/reports/route.ts
// since this needs different inputs (per-bank-account, not a single-company
// GL report) and a different shape.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = new Date(searchParams.get('from') || `${new Date().getFullYear()}-01-01`)
  const to = new Date(searchParams.get('to') || new Date().toISOString())

  const [accounts, company] = await Promise.all([
    prisma.bankAccount.findMany({ where: { companyId: session.companyId }, orderBy: { bank_name: 'asc' } }),
    prisma.company.findUnique({ where: { id: session.companyId }, select: { currency: true } }),
  ])
  const reportingCurrency = company?.currency || 'USD'
  const convert = await buildCurrencyConverter(reportingCurrency, to)
  const accountIds = accounts.map((a) => a.id)

  const [payments, reconciliations] = await Promise.all([
    prisma.payment.findMany({
      where: { bank_account_id: { in: accountIds }, payment_date: { gte: from.toISOString(), lte: to.toISOString() } },
      select: { bank_account_id: true, payment_date: true, payment_type: true, amount: true },
    }),
    prisma.bankReconciliation.findMany({ where: { bankAccountId: { in: accountIds } }, orderBy: { reconcileDate: 'desc' } }),
  ])

  const inByAccount: Record<string, number> = {}
  const outByAccount: Record<string, number> = {}
  const monthlyBuckets: { month: string; totalIn: number; totalOut: number }[] = []
  const monthIndex: Record<string, number> = {}

  for (const p of payments) {
    if (!p.bank_account_id || !p.payment_date) continue
    const amt = Number(p.amount ?? 0)
    const isIn = p.payment_type === 'Customer Receipt'
    if (isIn) inByAccount[p.bank_account_id] = (inByAccount[p.bank_account_id] ?? 0) + amt
    else outByAccount[p.bank_account_id] = (outByAccount[p.bank_account_id] ?? 0) + amt

    const key = monthKey(new Date(p.payment_date))
    if (!(key in monthIndex)) {
      monthIndex[key] = monthlyBuckets.length
      monthlyBuckets.push({ month: key, totalIn: 0, totalOut: 0 })
    }
    const bucket = monthlyBuckets[monthIndex[key]]
    if (isIn) bucket.totalIn += amt
    else bucket.totalOut += amt
  }

  const accountSummaries = accounts.map((a) => ({
    id: a.id,
    bankName: a.bank_name,
    accountNumber: a.account_number,
    currency: a.currency,
    isActive: !!a.is_active,
    openingBalance: Number(a.opening_balance ?? 0),
    currentBalance: Number(a.current_balance ?? 0),
    totalIn: round2dp(inByAccount[a.id] ?? 0),
    totalOut: round2dp(outByAccount[a.id] ?? 0),
  }))

  const accountNameById = Object.fromEntries(accounts.map((a) => [a.id, a.bank_name ?? '']))
  const reconciliationSummary = reconciliations.map((r) => ({
    bankName: accountNameById[r.bankAccountId] ?? '',
    reconcileDate: r.reconcileDate,
    statementBalance: Number(r.statementBalance),
    bookBalance: Number(r.bookBalance),
    difference: Number(r.difference),
    status: r.status,
  }))

  // Per-account figures in accountSummaries stay in their own native
  // currency; only the blended totals need converting to the reporting
  // currency before summing -- otherwise a USD + ZWG mix silently adds raw
  // numbers under one "$" label.
  const totalBalance = accountSummaries
    .filter((a) => a.isActive)
    .reduce((s, a) => s + convert(a.currentBalance, a.currency).amount, 0)
  const totalIn = accountSummaries.reduce((s, a) => s + convert(a.totalIn, a.currency).amount, 0)
  const totalOut = accountSummaries.reduce((s, a) => s + convert(a.totalOut, a.currency).amount, 0)

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    reportingCurrency,
    accountSummaries,
    reconciliationSummary,
    monthlyCashFlow: monthlyBuckets,
    totals: {
      totalBalance: round2dp(totalBalance),
      totalIn: round2dp(totalIn),
      totalOut: round2dp(totalOut),
    },
  })
}
