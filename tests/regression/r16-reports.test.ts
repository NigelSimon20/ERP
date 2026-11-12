import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ledgerBalances, fiscalYearStart } from '@/lib/reports/ledger'
import * as reports from '@/app/api/finance/reports/route'
import * as financeDashboard from '@/app/api/dashboard/finance/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoice, receipt, createBill, postedJournal } from './actions'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Regression R16–R18: reports, dashboard, pagination', () => {
  let fx: ZZ
  const today = new Date().toISOString().slice(0, 10)
  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
    // A small month of activity, all dated within the current fiscal year.
    const d = today
    const a = await invoice(fx, 300, { issueDate: d })
    await invoice(fx, 120.5, { issueDate: d, customerId: fx.customers.b.id })
    expect((await receipt(fx, { invoiceId: a.id, amount: 100, receiptDate: d })).status).toBe(201)
    expect((await createBill(fx, 45.25, { issueDate: d })).status).toBe(201)
    await postedJournal([{ accountId: fx.accounts.officeExpenses.id, debit: 12.34 }, { accountId: fx.accounts.prepaid.id, credit: 12.34 }], d)
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('R16: Assets = Liabilities + Equity exactly; Current Year Earnings = Income Statement net profit; difference 0', async () => {
    const from = fiscalYearStart(new Date()).toISOString().slice(0, 10)
    const [bs, is] = await Promise.all([
      callRoute(reports.GET, { path: `/api/finance/reports?type=balance-sheet&asAt=${today}` }),
      callRoute(reports.GET, { path: `/api/finance/reports?type=income-statement&from=${from}&to=${today}` }),
    ])
    expect(bs.status, JSON.stringify(bs.json)).toBe(200)
    expect(bs.json.difference).toBe(0)
    expect(bs.json.balanced).toBe(true)
    expect(bs.json.currentYearEarnings).toBe(is.json.netProfit)
    expect(is.json.netProfit).toBe(Number(new Prisma.Decimal(300).add(120.5).sub(45.25).sub(12.34)))
  })

  it('R17: dashboard revenue, expenses and net = Income Statement; AR = GL 1100; cash = Σ bank GL', async () => {
    const from = fiscalYearStart(new Date()).toISOString().slice(0, 10)
    const [dash, is] = await Promise.all([
      callRoute(financeDashboard.GET, { path: '/api/dashboard/finance' }),
      callRoute(reports.GET, { path: `/api/finance/reports?type=income-statement&from=${from}&to=${today}` }),
    ])
    expect(dash.status, JSON.stringify(dash.json)).toBe(200)
    expect([dash.json.totalRevenue, dash.json.totalExpenses, dash.json.netProfit]).toEqual([is.json.totalRevenue, is.json.totalExpenses, is.json.netProfit])
    const gl = new Map((await ledgerBalances(prisma, fx.companyId, {})).map((r) => [r.id, Number(r.balance)]))
    expect(dash.json.outstandingReceivables).toBe(gl.get(fx.accounts.receivables.id))
    expect(dash.json.cashInBank).toBe((gl.get(fx.accounts.bank1.id) ?? 0) + (gl.get(fx.accounts.bank2.id) ?? 0))
  })

  it('R18: `limit` is honoured, ids are unique across pages, and `summary` equals the SQL totals', async () => {
    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const r = await callRoute(salesInvoices.GET, { path: `/api/finance/sales-invoices?page=${page}&limit=1` })
      expect(r.json.invoices.length).toBeLessThanOrEqual(1)
      seen.push(...r.json.invoices.map((i: { id: string }) => i.id))
    }
    expect(seen).toHaveLength(2)
    expect(new Set(seen).size).toBe(2)
    const r = await callRoute(salesInvoices.GET, { path: '/api/finance/sales-invoices?limit=1' })
    const [sql] = await prisma.$queryRaw<{ count: bigint; total: Prisma.Decimal; paid: Prisma.Decimal }[]>`
      SELECT COUNT(*) AS count, SUM(total_amount) AS total, SUM(amount_paid) AS paid FROM sales_invoices WHERE "companyId" = ${fx.companyId}`
    expect(r.json.summary).toMatchObject({ count: Number(sql.count), totalInvoiced: Number(sql.total), totalPaid: Number(sql.paid), outstanding: Number(new Prisma.Decimal(sql.total).sub(sql.paid)) })
  })
})
