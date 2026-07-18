import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DB_STATUS_OUTSTANDING } from '@/lib/invoice-status'
import { convertToReportingCurrency } from '@/lib/currency'

const NORMAL_DEBIT = ['ASSET', 'EXPENSE']

function computeBalance(type: string, debit: number, credit: number) {
  return NORMAL_DEBIT.includes(type) ? debit - credit : credit - debit
}

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const asAt = searchParams.get('asAt')
  const { companyId } = session

  if (type === 'income-statement') {
    if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })
    const fromDate = new Date(from)
    const toDate = new Date(to)

    const postedEntries = await prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', entry_date: { gte: fromDate.toISOString(), lte: toDate.toISOString() } },
      select: { id: true },
    })
    const entryIds = postedEntries.map((e) => e.id)

    const [revAccts, expAccts] = await Promise.all([
      prisma.chartOfAccount.findMany({ where: { account_type: 'REVENUE', companyId }, select: { id: true, account_name: true, account_code: true } }),
      prisma.chartOfAccount.findMany({ where: { account_type: 'EXPENSE', companyId }, select: { id: true, account_name: true, account_code: true } }),
    ])

    const [revLines, expLines] = await Promise.all([
      prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: revAccts.map((a) => a.id) }, journalEntryId: { in: entryIds } },
        _sum: { debit: true, credit: true },
      }),
      prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: expAccts.map((a) => a.id) }, journalEntryId: { in: entryIds } },
        _sum: { debit: true, credit: true },
      }),
    ])

    const revMap = Object.fromEntries(revLines.map((l) => [l.accountId, l._sum]))
    const expMap = Object.fromEntries(expLines.map((l) => [l.accountId, l._sum]))

    const revenueRows = revAccts.map((a) => ({ ...a, name: a.account_name, accountCode: a.account_code, amount: Number(revMap[a.id]?.credit ?? 0) - Number(revMap[a.id]?.debit ?? 0) }))
    const expenseRows = expAccts.map((a) => ({ ...a, name: a.account_name, accountCode: a.account_code, amount: Number(expMap[a.id]?.debit ?? 0) - Number(expMap[a.id]?.credit ?? 0) }))
    const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0)
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0)

    return NextResponse.json({ type, from, to, revenueRows, expenseRows, totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses })
  }

  if (type === 'balance-sheet') {
    const asAtDate = asAt ? new Date(asAt) : new Date()

    const accounts = await prisma.chartOfAccount.findMany({
      where: { account_type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, companyId },
      select: { id: true, account_name: true, account_code: true, account_type: true },
      orderBy: { account_code: 'asc' },
    })

    const postedEntries = await prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', entry_date: { lte: asAtDate.toISOString() } },
      select: { id: true },
    })

    const lineAggs = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map((a) => a.id) }, journalEntryId: { in: postedEntries.map((e) => e.id) } },
      _sum: { debit: true, credit: true },
    })

    const lineMap = Object.fromEntries(lineAggs.map((l) => [l.accountId, l._sum]))
    const rows = accounts.map((a) => ({
      ...a,
      name: a.account_name,
      accountCode: a.account_code,
      type: a.account_type,
      balance: computeBalance(a.account_type ?? 'ASSET', Number(lineMap[a.id]?.debit ?? 0), Number(lineMap[a.id]?.credit ?? 0)),
    }))

    const assets = rows.filter((r) => r.account_type === 'ASSET').reduce((s, r) => s + r.balance, 0)
    const liabilities = rows.filter((r) => r.account_type === 'LIABILITY').reduce((s, r) => s + r.balance, 0)
    const equity = rows.filter((r) => r.account_type === 'EQUITY').reduce((s, r) => s + r.balance, 0)

    return NextResponse.json({ type, asAt: asAtDate, rows, assets, liabilities, equity, balanced: Math.abs(assets - (liabilities + equity)) < 0.01 })
  }

  if (type === 'trial-balance') {
    if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })
    const fromDate = new Date(from)
    const toDate = new Date(to)

    const accounts = await prisma.chartOfAccount.findMany({
      where: { companyId },
      select: { id: true, account_name: true, account_code: true, account_type: true },
      orderBy: { account_code: 'asc' },
    })

    const postedEntries = await prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', entry_date: { gte: fromDate.toISOString(), lte: toDate.toISOString() } },
      select: { id: true },
    })

    const lineAggs = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map((a) => a.id) }, journalEntryId: { in: postedEntries.map((e) => e.id) } },
      _sum: { debit: true, credit: true },
    })

    const lineMap = Object.fromEntries(lineAggs.map((l) => [l.accountId, l._sum]))
    const rows = accounts
      .map((a) => ({
        ...a,
        name: a.account_name,
        accountCode: a.account_code,
        type: a.account_type,
        totalDebit: Number(lineMap[a.id]?.debit ?? 0),
        totalCredit: Number(lineMap[a.id]?.credit ?? 0),
      }))
      .filter((r) => r.totalDebit > 0 || r.totalCredit > 0)

    return NextResponse.json({
      type, from, to, rows,
      grandDebit: rows.reduce((s, r) => s + r.totalDebit, 0),
      grandCredit: rows.reduce((s, r) => s + r.totalCredit, 0),
    })
  }

  if (type === 'aged-receivables') {
    const now = new Date()
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true } })
    const reportingCurrency = company?.currency ?? 'USD'
    const customers = await prisma.customer.findMany({ where: { companyId } })
    const invoices = await prisma.salesInvoice.findMany({
      where: { companyId, status: { in: DB_STATUS_OUTSTANDING } },
      select: { id: true, customer_id: true, due_date: true, balance_due: true, currency: true },
    })
    const invoicesByCustomer = invoices.reduce((acc: Record<string, typeof invoices>, inv) => {
      const cid = inv.customer_id ?? ''
      if (!acc[cid]) acc[cid] = []
      acc[cid].push(inv)
      return acc
    }, {})
    const rows = await Promise.all(customers.filter((c) => (invoicesByCustomer[c.id]?.length ?? 0) > 0).map(async (c) => {
      const b = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
      for (const inv of (invoicesByCustomer[c.id] ?? [])) {
        const days = Math.floor((now.getTime() - new Date(inv.due_date ?? now).getTime()) / 86_400_000)
        const amt = await convertToReportingCurrency(Number(inv.balance_due ?? 0), inv.currency, reportingCurrency)
        if (days <= 0) b.current += amt
        else if (days <= 30) b.days1_30 += amt
        else if (days <= 60) b.days31_60 += amt
        else if (days <= 90) b.days61_90 += amt
        else b.days90plus += amt
      }
      return { customer: c.company_name ?? c.id, ...b, total: Object.values(b).reduce((s, v) => s + v, 0) }
    }))

    const totals = rows.reduce((acc, r) => ({ current: acc.current + r.current, days1_30: acc.days1_30 + r.days1_30, days31_60: acc.days31_60 + r.days31_60, days61_90: acc.days61_90 + r.days61_90, days90plus: acc.days90plus + r.days90plus, total: acc.total + r.total }), { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0 })
    return NextResponse.json({ type, rows, totals })
  }

  if (type === 'aged-payables') {
    const now = new Date()
    const suppliers = await prisma.supplier.findMany({ where: { companyId } })
    const bills = await prisma.purchaseInvoice.findMany({
      where: { companyId, status: { notIn: ['VOID', 'PAID'] } as any, balanceDue: { gt: 0 } },
      select: { id: true, supplierId: true, dueDate: true, balanceDue: true },
    })
    const billsBySupplier = bills.reduce((acc: Record<string, typeof bills>, b) => {
      if (!acc[b.supplierId]) acc[b.supplierId] = []
      acc[b.supplierId].push(b)
      return acc
    }, {})
    const rows = suppliers.filter((s) => (billsBySupplier[s.id]?.length ?? 0) > 0).map((s) => {
      const b = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
      for (const inv of (billsBySupplier[s.id] ?? [])) {
        const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000)
        const amt = Number(inv.balanceDue)
        if (days <= 0) b.current += amt
        else if (days <= 30) b.days1_30 += amt
        else if (days <= 60) b.days31_60 += amt
        else if (days <= 90) b.days61_90 += amt
        else b.days90plus += amt
      }
      return { supplier: s.company_name ?? s.id, ...b, total: Object.values(b).reduce((s, v) => s + v, 0) }
    })

    const totals = rows.reduce((acc, r) => ({ current: acc.current + r.current, days1_30: acc.days1_30 + r.days1_30, days31_60: acc.days31_60 + r.days31_60, days61_90: acc.days61_90 + r.days61_90, days90plus: acc.days90plus + r.days90plus, total: acc.total + r.total }), { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0 })
    return NextResponse.json({ type, rows, totals })
  }

  return NextResponse.json({ error: 'Invalid report type. Use: income-statement, balance-sheet, trial-balance, aged-receivables, aged-payables' }, { status: 400 })
}
