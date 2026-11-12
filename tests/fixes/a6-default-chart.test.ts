import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { accountCodeProblem } from '@/lib/journal-rules'
import { seedChartOfAccounts, DEFAULT_CHART } from '@/lib/onboarding/seedChartOfAccounts'
import * as register from '@/app/api/auth/register/route'
import * as accounts from '@/app/api/finance/accounts/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import { seedZZTest } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

// A6: a company created through sign-up had no chart of accounts, so
// invoices, payroll and assets had nothing to post to.
describe('A6 default chart of accounts', () => {
  beforeAll(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('every default account respects its type’s code range', () => {
    for (const a of DEFAULT_CHART) expect(accountCodeProblem(a.code, a.type), a.code).toBeNull()
  })

  it('sign-up creates the chart and links the settings', async () => {
    await loginAs(null)
    const email = `a6.${crypto.randomUUID().slice(0, 8)}@zztest.local`
    const r = await callRoute(register.POST, { method: 'POST', path: '/api/auth/register', body: { name: 'A6 Owner', phone: '+263770000000', companyName: 'ZZTEST A6 Signup', email, password: 'Correct-horse-1', confirmPassword: 'Correct-horse-1' } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    const companyId = r.json.company.id
    const rows = await prisma.chartOfAccount.findMany({ where: { companyId } })
    expect(rows.map((a) => a.account_code).sort()).toEqual(DEFAULT_CHART.map((a) => a.code).sort())
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
    const code = (id: string | null) => rows.find((a) => a.id === id)?.account_code
    expect([company.receivablesAccountId, company.payablesAccountId, company.vatAccountId, company.salariesExpenseAccountId, company.payrollLiabilitiesAccountId, company.netPayPayableAccountId, company.fixedAssetsAccountId, company.accumulatedDepreciationAccountId, company.depreciationExpenseAccountId, company.inventoryAccountId].map(code))
      .toEqual(['1100', '2000', '2100', '6106', '2200', '2210', '1500', '1510', '5200', '1200'])

    // ... and the new company can invoice straight away.
    const user = await prisma.user.findFirstOrThrow({ where: { companyId } })
    await loginAs({ userId: user.id, companyId, role: 'SUPER_ADMIN', name: user.name, email: user.email })
    const customer = { id: crypto.randomUUID(), companyId, company_name: 'First Client', is_active: true, currency: 'USD' }
    await prisma.customer.create({ data: customer })
    const inv = await callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', body: {
      customerId: customer.id, issueDate: '2026-11-01', dueDate: '2026-11-30', revenueAccountId: rows.find((a) => a.account_code === '4100')!.id,
      lineItems: [{ description: 'Guarding', quantity: 1, unitPrice: 100, taxRate: 15.5 }],
    } })
    expect(inv.status, JSON.stringify(inv.json)).toBe(201)
  })

  it('is idempotent, also when two loads race', async () => {
    const companyId = crypto.randomUUID()
    await prisma.company.create({ data: { id: companyId, name: 'ZZTEST A6 Empty' } })
    const results = await Promise.all([seedChartOfAccounts(prisma, companyId), seedChartOfAccounts(prisma, companyId)])
    expect(results.map((r) => r.created).sort((a, b) => a - b)).toEqual([0, DEFAULT_CHART.length])
    expect((await seedChartOfAccounts(prisma, companyId)).created).toBe(0)
    expect(await prisma.chartOfAccount.count({ where: { companyId } })).toBe(DEFAULT_CHART.length)
  })

  it('"Load default chart" never touches a company that already has accounts', async () => {
    const fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
    const before = await prisma.chartOfAccount.findMany({ where: { companyId: fx.companyId }, orderBy: { id: 'asc' } })
    const r = await callRoute(accounts.POST, { method: 'POST', path: '/api/finance/accounts?action=load-default' })
    expect([r.status, r.json.created]).toEqual([200, 0])
    expect(await prisma.chartOfAccount.findMany({ where: { companyId: fx.companyId }, orderBy: { id: 'asc' } })).toEqual(before)
  })

  it('"Load default chart" fills an empty company; staff without finance rights get 403', async () => {
    const fx = await seedZZTest({ bank1Funds: 0 })
    await prisma.company.update({ where: { id: fx.companyId }, data: { receivablesAccountId: null, payablesAccountId: null, vatAccountId: null, salariesExpenseAccountId: null, payrollLiabilitiesAccountId: null, fixedAssetsAccountId: null, accumulatedDepreciationAccountId: null, depreciationExpenseAccountId: null, inventoryAccountId: null } })
    await prisma.bankAccount.deleteMany({ where: { companyId: fx.companyId } })
    await prisma.chartOfAccount.deleteMany({ where: { companyId: fx.companyId } })
    await loginAs(fx.sessionFor(fx.users.ops))
    expect((await callRoute(accounts.POST, { method: 'POST', path: '/api/finance/accounts?action=load-default' })).status).toBe(403)
    await loginAs(fx.sessionFor(fx.users.finance))
    const r = await callRoute(accounts.POST, { method: 'POST', path: '/api/finance/accounts?action=load-default' })
    expect([r.status, r.json.created]).toEqual([200, DEFAULT_CHART.length])
  })
})
