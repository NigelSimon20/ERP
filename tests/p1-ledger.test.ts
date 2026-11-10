import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { money, cents } from '@/lib/money'
import { autoJournalReference, accountCodeProblem, journalLineProblems } from '@/lib/journal-rules'
import { incomeStatement, ledgerBalanceSheet, fiscalYearStart } from '@/lib/reports/ledger'
import { getReceivables } from '@/lib/reports/subledger'
import { computeTrialBalance } from '@/lib/balance-sheet'
import * as journals from '@/app/api/finance/journal-entries/route'
import * as journal from '@/app/api/finance/journal-entries/[id]/route'
import * as reports from '@/app/api/finance/reports/route'
import * as financeDashboard from '@/app/api/dashboard/finance/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

async function createAndPost(fx: Fixture, date: string, lines: { accountId: string; debit?: number; credit?: number }[]) {
  const c = await callRoute(journals.POST, { method: 'POST', path: '/api/finance/journal-entries', body: { entryDate: date, description: 'Test entry', lines: lines.map((l) => ({ debit: 0, credit: 0, ...l })) } })
  expect(c.status, JSON.stringify(c.json)).toBe(201)
  const id = c.json.entry.id
  const p = await callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${id}?action=post`, params: { id } })
  expect(p.status, JSON.stringify(p.json)).toBe(200)
  return id
}

describe('P1-1 money', () => {
  it('rounds half-up on decimals, not floats', () => {
    expect(money(1.005).toFixed(2)).toBe('1.01')
    expect(money('585.585').toFixed(2)).toBe('585.59')
    expect(money(139066.26078634209).toFixed(2)).toBe('139066.26')
    expect(cents(0.1 + 0.2)).toBe(30)
  })
  it('Decimal serialises and adds as a number (no "0.1" + 1 = "0.11")', () => {
    const d = new Prisma.Decimal('0.1')
    expect(JSON.parse(JSON.stringify({ d }))).toEqual({ d: 0.1 })
    expect((d as unknown as number) + 1).toBe(1.1)
  })
})

describe('P1-6 journal rules', () => {
  let fx: Fixture
  let other: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Rules Co')
    other = await seedCompany('Rules Other')
    await prisma.chartOfAccount.update({ where: { id: fx.accounts.expense.id }, data: { is_active: false } })
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  const post = (lines: unknown[], entryDate = '2026-11-03') =>
    callRoute(journals.POST, { method: 'POST', path: '/api/finance/journal-entries', body: { entryDate, description: 'Validation case', lines } })

  it.each([
    ['unbalanced', () => [{ accountId: fx.accounts.bank.id, debit: 10, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 9 }]],
    ['fewer than 2 lines', () => [{ accountId: fx.accounts.bank.id, debit: 10, credit: 0 }]],
    ['all zero (RS-JE-000508)', () => [{ accountId: fx.accounts.bank.id, debit: 0, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 0 }]],
    ['debit and credit on one line (RS-JE-000510)', () => [{ accountId: fx.accounts.bank.id, debit: 5, credit: 5 }, { accountId: fx.accounts.revenue.id, debit: 5, credit: 5 }]],
    ['negative amount', () => [{ accountId: fx.accounts.bank.id, debit: -10, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: -10 }]],
    ['missing account (RS-JE-000509)', () => [{ accountId: crypto.randomUUID(), debit: 10, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 10 }]],
    ["another company's account", () => [{ accountId: other.accounts.bank.id, debit: 10, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 10 }]],
    ['inactive account', () => [{ accountId: fx.accounts.expense.id, debit: 10, credit: 0 }, { accountId: fx.accounts.bank.id, debit: 0, credit: 10 }]],
  ])('rejects %s with 400', async (_name, lines) => {
    const r = await post(lines())
    expect(r.status, JSON.stringify(r.json)).toBe(400)
    expect(r.json.code).toBeDefined()
  })

  it('rejects an invalid date with a validation error, not a Prisma error', async () => {
    const r = await post([{ accountId: fx.accounts.bank.id, debit: 1, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 1 }], 'not-a-date')
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('VALIDATION_ERROR')
  })

  it('posting a pre-existing draft that points at a missing account is a 400, not a 500', async () => {
    const id = crypto.randomUUID()
    await prisma.journalEntry.create({ data: { id, companyId: fx.companyId, reference: 'RS-JE-000509', entry_date: '2026-11-03', description: 'Legacy draft', status: 'DRAFT' } })
    await prisma.journalLine.createMany({ data: [
      { id: crypto.randomUUID(), journalEntryId: id, accountId: crypto.randomUUID(), debit: 10, credit: 0 },
      { id: crypto.randomUUID(), journalEntryId: id, accountId: fx.accounts.revenue.id, debit: 0, credit: 10 },
    ] })
    const r = await callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${id}?action=post`, params: { id } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('INVALID_ACCOUNT')
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT')
  })

  it('two simultaneous posts of one draft apply its balances once', async () => {
    const c = await post([{ accountId: fx.accounts.bank.id, debit: 40, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 40 }])
    const id = c.json.entry.id
    const before = Number((await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: fx.accounts.bank.id } })).current_balance ?? 0)
    const results = await Promise.all([1, 2].map(() => callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${id}?action=post`, params: { id } })))
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const after = Number((await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: fx.accounts.bank.id } })).current_balance)
    expect(after - before).toBe(40)
  })

  it('builds auto-journal references with a single prefix (BUG-016)', () => {
    expect(autoJournalReference('INV', 'INV-000035')).toBe('JE-auto-INV-000035')
    expect(autoJournalReference('INV', 'INV-INV-INV-000035')).toBe('JE-auto-INV-000035')
    expect(autoJournalReference('INV', '000035')).toBe('JE-auto-INV-000035')
  })

  it('flags account codes outside their type range ("4000 Bank Loan")', () => {
    expect(accountCodeProblem('4000', 'LIABILITY')).toMatch(/2000–2999/)
    expect(accountCodeProblem('2100', 'LIABILITY')).toBeNull()
  })

  it('a payroll-style journal with no lines is rejected (RS-JE-000507)', () => {
    expect(journalLineProblems([]).length).toBeGreaterThan(0)
  })
})

describe('P1-1 / P1-2 ledger reports', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Ledger Co')
    await loginAs(fx.sessionFor(fx.users.finance))
    const a = fx.accounts
    const equity = { id: crypto.randomUUID(), companyId: fx.companyId, account_code: '3000', account_name: 'Share Capital', account_type: 'EQUITY', is_active: true }
    await prisma.chartOfAccount.create({ data: equity })
    await createAndPost(fx, '2025-06-01', [{ accountId: a.receivables.id, debit: 200 }, { accountId: a.revenue.id, credit: 200 }]) // prior fiscal year
    await createAndPost(fx, '2026-02-01', [{ accountId: a.bank.id, debit: 500 }, { accountId: equity.id, credit: 500 }])
    await createAndPost(fx, '2026-03-01', [{ accountId: a.receivables.id, debit: 1000 }, { accountId: a.revenue.id, credit: 1000 }])
    await createAndPost(fx, '2026-04-01', [{ accountId: a.expense.id, debit: 300 }, { accountId: a.bank.id, credit: 300 }])
    // 0.1 + 0.2 must be exactly 0.30, not 0.30000000000000004.
    await createAndPost(fx, '2026-05-01', [{ accountId: a.expense.id, debit: 0.1 }, { accountId: a.expense.id, debit: 0.2 }, { accountId: a.bank.id, credit: 0.3 }])
  })

  it('trial balance sums are exact and balanced with zero tolerance', async () => {
    const tb = await computeTrialBalance(prisma, fx.companyId, new Date('2026-01-01'), new Date('2026-12-31T23:59:59Z'))
    expect(tb.grandDebit).toBe(1800.3)
    expect(tb.grandCredit).toBe(1800.3)
    expect(tb.difference).toBe(0)
    expect(tb.balanced).toBe(true)
    const expense = tb.rows.find((r) => r.id === fx.accounts.expense.id)!
    expect(expense.totalDebit).toBe(300.3)
  })

  it('Current Year Earnings equals Income Statement net profit and the sheet balances without a plug', async () => {
    const asAt = new Date('2026-12-31T23:59:59Z')
    const is = await incomeStatement(prisma, fx.companyId, fiscalYearStart(asAt), asAt)
    expect(is.netProfit.toFixed(2)).toBe('699.70')
    const bs = await ledgerBalanceSheet(prisma, fx.companyId, asAt)
    expect(bs.currentYearEarnings.toFixed(2)).toBe(is.netProfit.toFixed(2))
    expect(bs.priorYearsEarnings.toFixed(2)).toBe('200.00')
    expect(bs.difference.toFixed(2)).toBe('0.00')
    expect(bs.balanced).toBe(true)
    expect(bs.assets.toFixed(2)).toBe(bs.liabilities.add(bs.equity).toFixed(2))
  })

  it('an unbalanced historical posting is reported as balanced: false with the difference', async () => {
    const id = crypto.randomUUID()
    await prisma.journalEntry.create({ data: { id, companyId: fx.companyId, reference: 'LEGACY-1', entry_date: '2026-06-01', status: 'POSTED' } })
    await prisma.journalLine.create({ data: { id: crypto.randomUUID(), journalEntryId: id, accountId: fx.accounts.bank.id, debit: 0.03, credit: 0 } })
    const r = await callRoute(reports.GET, { path: '/api/finance/reports?type=balance-sheet&asAt=2026-12-31' })
    expect(r.json.balanced).toBe(false)
    expect(r.json.difference).toBe(0.03)
    await prisma.journalLine.deleteMany({ where: { journalEntryId: id } })
    await prisma.journalEntry.delete({ where: { id } })
  })

  it('the finance dashboard reports the same revenue and profit as the Income Statement', async () => {
    const now = new Date()
    const from = fiscalYearStart(now).toISOString().slice(0, 10)
    const to = now.toISOString().slice(0, 10)
    const [dash, is] = await Promise.all([
      callRoute(financeDashboard.GET, { path: '/api/dashboard/finance' }),
      callRoute(reports.GET, { path: `/api/finance/reports?type=income-statement&from=${from}&to=${to}` }),
    ])
    expect(dash.status, JSON.stringify(dash.json)).toBe(200)
    expect(dash.json.totalRevenue).toBe(is.json.totalRevenue)
    expect(dash.json.netProfit).toBe(is.json.netProfit)
    expect(dash.json).toHaveProperty('cashCollected')
  })
})

describe('P1-4 receivables subledger', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('AR Co')
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('AR from open invoices ties out to the receivables control account', async () => {
    for (const price of [100, 250.5]) {
      const r = await callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', body: {
        customerId: fx.customer.id, issueDate: '2026-11-01', dueDate: '2026-11-30', revenueAccountId: fx.accounts.revenue.id,
        lineItems: [{ description: 'Guarding', quantity: 1, unitPrice: price, taxRate: 0 }],
      } })
      expect(r.status, JSON.stringify(r.json)).toBe(201)
    }
    const ar = await getReceivables(prisma, fx.companyId)
    expect(ar.total.toFixed(2)).toBe('350.50')
    expect(ar.controlAccountBalance?.toFixed(2)).toBe('350.50')
    expect(ar.difference?.toFixed(2)).toBe('0.00')
  })

  it('an invoice marked PAID with money still owing is still counted (BUG-009)', async () => {
    const id = crypto.randomUUID()
    await prisma.salesInvoice.create({ data: { id, companyId: fx.companyId, customer_id: fx.customer.id, invoice_number: '2421456', total_amount: 7491.91, amount_paid: 0, status: 'Paid', currency: 'USD' } })
    const ar = await getReceivables(prisma, fx.companyId)
    expect(ar.total.toFixed(2)).toBe('7842.41')
    await prisma.salesInvoice.delete({ where: { id } })
  })

  it('the finance dashboard shows the subledger figure', async () => {
    const dash = await callRoute(financeDashboard.GET, { path: '/api/dashboard/finance' })
    const ar = await getReceivables(prisma, fx.companyId)
    expect(dash.json.outstandingReceivables).toBe(Number(ar.total))
  })
})

describe('Issue failures leave documents as drafts', () => {
  it('a credit note whose posting fails stays DRAFT instead of ISSUED with no journal', async () => {
    const fx = await seedCompany('Issue Co')
    await loginAs(fx.sessionFor(fx.users.finance))
    const { POST: create } = await import('@/app/api/finance/credit-notes/route')
    const { PUT: update } = await import('@/app/api/finance/credit-notes/[id]/route')
    const c = await callRoute(create, { method: 'POST', path: '/api/finance/credit-notes', body: { customerId: fx.customer.id, issueDate: '2026-11-02', reason: 'Test', lineItems: [{ description: 'x', quantity: 1, unitPrice: 10, taxRate: 0 }] } })
    const id = c.json.creditNote.id
    // An inactive AR account makes postJournal refuse the posting.
    await prisma.chartOfAccount.update({ where: { id: fx.accounts.receivables.id }, data: { is_active: false } })
    const r = await callRoute(update, { method: 'PUT', path: `/api/finance/credit-notes/${id}?action=issue`, params: { id }, body: { revenueAccountId: fx.accounts.revenue.id } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('INACTIVE_ACCOUNT')
    expect((await prisma.creditNote.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT')
  })
})

