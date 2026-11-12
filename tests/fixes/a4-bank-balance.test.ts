import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { ledgerBalances } from '@/lib/reports/ledger'
import { postOpeningBalance } from '@/lib/opening-balances'
import * as bankAccounts from '@/app/api/finance/bank-accounts/route'
import * as payroll from '@/app/api/hr/payroll/route'
import * as run from '@/app/api/hr/payroll/[id]/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoice, receipt, payment, transfer } from '../regression/actions'
import { assertLedgerInvariants } from '../regression/invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

// A4: the Bank Accounts page's "calculated balance" summed receipts and
// payments only, so transfers and payroll showed as a variance (stored -7.00
// vs calculated -2.00) while the GL agreed with the stored figure.
describe('A4 calculated bank balance comes from the ledger', () => {
  let fx: ZZ
  const banks = async () => {
    const r = await callRoute(bankAccounts.GET, { path: '/api/finance/bank-accounts' })
    return new Map((r.json.accounts as { id: string; currentBalance: number; calculatedBalance: number }[]).map((a) => [a.id, a]))
  }
  const gl = async (id: string) => Number((await ledgerBalances(prisma, fx.companyId, {})).find((a) => a.id === id)?.balance ?? 0)

  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('after a receipt, a payment, a transfer in and out and a payroll payment: stored = calculated = GL', async () => {
    const inv = await invoice(fx, 100)
    expect((await receipt(fx, { invoiceId: inv.id, amount: 100 })).status).toBe(201)
    expect((await payment(fx, { amount: 30, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id })).status).toBe(201)
    expect((await transfer(fx, { amount: 200 })).status).toBe(201)
    expect((await transfer(fx, { fromAccountId: fx.banks.b2.id, toAccountId: fx.banks.b1.id, amount: 50 })).status).toBe(201)
    for (const g of fx.guards) {
      await prisma.attendance.createMany({ data: [1, 2].map((d) => ({ id: crypto.randomUUID(), guardId: g.id, date: new Date(Date.UTC(2026, 10, d)), status: 'PRESENT' as never })) })
    }
    await loginAs(fx.sessionFor(fx.users.hr))
    const c = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { periodStart: '2026-11-01', periodEnd: '2026-11-30', bankAccountId: fx.banks.b1.id } })
    await loginAs(fx.sessionFor(fx.users.admin))
    expect((await callRoute(run.POST, { method: 'POST', path: `/api/hr/payroll/${c.json.runId}?action=approve`, params: { id: c.json.runId } })).status).toBe(200)
    expect((await callRoute(run.POST, { method: 'POST', path: `/api/hr/payroll/${c.json.runId}?action=pay`, params: { id: c.json.runId }, body: { paymentDate: '2026-11-30' } })).status).toBe(200)
    await loginAs(fx.sessionFor(fx.users.finance))

    const list = await banks()
    // Bank 1: 1000 opening + 100 receipt - 30 payment - 200 transfer out + 50 in - 36 payroll = 884.
    expect(list.get(fx.banks.b1.id)).toMatchObject({ currentBalance: 884, calculatedBalance: 884 })
    expect(await gl(fx.accounts.bank1.id)).toBe(884)
    expect(list.get(fx.banks.b2.id)).toMatchObject({ currentBalance: 150, calculatedBalance: 150 })
    expect(await gl(fx.accounts.bank2.id)).toBe(150)
  })

  it('an opening balance not yet posted as a journal is added; one already posted is not counted twice', async () => {
    const mk = async (code: string, opening: number, posted: boolean) => {
      const glId = crypto.randomUUID()
      await prisma.chartOfAccount.create({ data: { id: glId, companyId: fx.companyId, account_code: code, account_name: `Bank ${code}`, account_type: 'ASSET', is_active: true, current_balance: posted ? opening : 0 } })
      const id = crypto.randomUUID()
      await prisma.bankAccount.create({ data: { id, companyId: fx.companyId, account_name: `Bank ${code}`, chart_account_id: glId, currency: 'USD', opening_balance: opening, current_balance: opening, is_active: true } })
      if (posted) await prisma.$transaction((tx) => postOpeningBalance(tx, { companyId: fx.companyId, accountId: glId, amount: opening, entryDate: '2026-01-01', userId: fx.users.admin.id, label: code }))
      return id
    }
    const unposted = await mk('1030', 75, false)
    const posted = await mk('1040', 60, true)
    const list = await banks()
    expect(list.get(unposted)?.calculatedBalance).toBe(75)
    expect(list.get(posted)?.calculatedBalance).toBe(60)
    // Tidy up: the unposted opening balance is a known gap the
    // opening-balances remediation script closes, not part of this tenant's books.
    await prisma.bankAccount.delete({ where: { id: unposted } })
  })

  it('a transfer involving a bank with no GL account -> 400 BANK_NOT_LINKED, nothing moves', async () => {
    const id = crypto.randomUUID()
    await prisma.bankAccount.create({ data: { id, companyId: fx.companyId, account_name: 'Unlinked', chart_account_id: null, currency: 'USD', current_balance: 0, is_active: true } })
    const before = (await banks()).get(fx.banks.b1.id)!.currentBalance
    const r = await transfer(fx, { toAccountId: id, amount: 5 })
    expect([r.status, r.json.code]).toEqual([400, 'BANK_NOT_LINKED'])
    expect((await banks()).get(fx.banks.b1.id)!.currentBalance).toBe(before)
    await prisma.bankAccount.delete({ where: { id } })
  })
})
