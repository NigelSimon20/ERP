import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import * as salesInvoice from '@/app/api/finance/sales-invoices/[id]/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { createInvoice } from '../regression/actions'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('A9.1 invoice notes are kept on create and update', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('notes sent on create and on update are stored', async () => {
    const c = await createInvoice(fx, { notes: 'Per contract C-12' })
    expect(c.status).toBe(201)
    const id = c.json.invoice.id
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })).overall_description).toBe('Per contract C-12')
    const u = await callRoute(salesInvoice.PUT, { method: 'PUT', path: `/api/finance/sales-invoices/${id}`, params: { id }, body: { notes: 'Revised: per contract C-13' } })
    expect(u.status, JSON.stringify(u.json)).toBe(200)
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })).overall_description).toBe('Revised: per contract C-13')
  })
})

describe('A9.2 one invoice status vocabulary', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('new invoices are stored UPPERCASE, and legacy rows are still understood', async () => {
    const { default: crypto } = await import('crypto')
    const { GET } = await import('@/app/api/finance/sales-invoices/route')
    const { receipt } = await import('../regression/actions')
    const c = await createInvoice(fx, { lineItems: [{ description: 'x', quantity: 1, unitPrice: 50, taxRate: 0 }] })
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: c.json.invoice.id } })).status).toBe('UNPAID')
    const legacy = (status: string, paid: number) => ({ id: crypto.randomUUID(), companyId: fx.companyId, customer_id: fx.customers.a.id, invoice_number: `LEG-${status}`, invoice_date: '2026-11-01', due_date: '2099-01-01', total_amount: 100, amount_paid: paid, balance_due: 100 - paid, status, currency: 'USD' })
    const rows = [legacy('Sent', 0), legacy('Partial', 40), legacy('Void', 0)]
    await prisma.salesInvoice.createMany({ data: rows })

    const unpaid = await callRoute(GET, { path: '/api/finance/sales-invoices?status=UNPAID' })
    expect(unpaid.json.invoices.map((i: { id: string }) => i.id).sort()).toEqual([c.json.invoice.id, rows[0].id].sort())
    const voided = await callRoute(GET, { path: '/api/finance/sales-invoices?status=VOID' })
    expect(voided.json.invoices.map((i: { id: string; status: string }) => [i.id, i.status])).toEqual([[rows[2].id, 'VOID']])
    // The summary leaves out the legacy void invoice: 50 + 100 + 100 invoiced.
    expect(unpaid.json.summary.totalInvoiced).toBe(250)
    // A legacy "Void" invoice still refuses receipts and a second void.
    expect((await receipt(fx, { invoiceId: rows[2].id, amount: 1 })).status).toBe(409)
    const again = await callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${rows[2].id}?action=void`, params: { id: rows[2].id } })
    expect(again.status).toBe(400)
    // Paying off the legacy "Partial" one stores PAID.
    expect((await receipt(fx, { invoiceId: rows[1].id, amount: 60 })).status).toBe(201)
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: rows[1].id } })).status).toBe('PAID')
  })
})

describe('A9.3 month-end depreciation catches up missed months', () => {
  const run = async (period: string) => {
    const cron = await import('@/app/api/cron/depreciation/route')
    process.env.CRON_SECRET = 'test-cron-secret'
    return callRoute(cron.GET, { path: `/api/cron/depreciation?period=${period}`, headers: { authorization: 'Bearer test-cron-secret' } })
  }
  const addAsset = async (fx: ZZ, name: string, purchaseDate: string) => {
    const assets = await import('@/app/api/finance/fixed-assets/route')
    const r = await callRoute(assets.POST, { method: 'POST', path: '/api/finance/fixed-assets', body: { name, category: 'Equipment', purchaseDate, purchasePrice: 1200, usefulLifeYears: 1 } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    return r.json.asset.id as string
  }
  const journals = (assetId: string) => prisma.journalEntry.findMany({ where: { source_type: 'depreciation', source_id: assetId, status: 'POSTED' }, orderBy: { entry_date: 'asc' } })

  it('charges every month from purchase, one journal per month dated at month end, once', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Dep', bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
    const id = await addAsset(fx, 'Radio mast', '2026-06-15')
    const r = await run('2026-11')
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    const js = await journals(id)
    expect(js.map((j) => j.entry_date?.slice(0, 10))).toEqual(['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30'])
    expect(js.every((j) => Number(j.total_debit) === 100)).toBe(true)
    expect(Number((await prisma.fixedAsset.findUniqueOrThrow({ where: { id } })).accumulatedDepreciation)).toBe(600)
    await run('2026-11')
    expect(await journals(id)).toHaveLength(6)
  })

  it('stops at the purchase price', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Dep Full', bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
    const id = await addAsset(fx, 'Old bike', '2025-11-10')
    await run('2026-11')
    const asset = await prisma.fixedAsset.findUniqueOrThrow({ where: { id } })
    expect([Number(asset.accumulatedDepreciation), Number(asset.currentValue)]).toEqual([1200, 0])
    expect(await journals(id)).toHaveLength(12)
  })

  it('never posts into a locked month: the asset waits, and finance is told', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Dep Locked', bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
    const id = await addAsset(fx, 'Gate camera', '2026-07-05')
    const lockDates = await import('@/app/api/finance/lock-dates/route')
    await callRoute(lockDates.POST, { method: 'POST', path: '/api/finance/lock-dates', body: { lockedUntil: '2026-08-31' } })
    const r = await run('2026-11')
    expect(await journals(id)).toHaveLength(0)
    const mine = r.json.results.find((x: { companyId: string }) => x.companyId === fx.companyId)
    expect(mine.blocked).toEqual([{ assetId: id, name: 'Gate camera', period: '2026-07' }])
    expect(await prisma.notification.count({ where: { companyId: fx.companyId, type: 'DEPRECIATION_BLOCKED' } })).toBeGreaterThan(0)
  })
})

describe('A9.5 a rejected receipt or payment leaves no gap in the numbering', () => {
  it('receipt numbers stay consecutive across a rejected overpayment', async () => {
    const { invoice, receipt } = await import('../regression/actions')
    const fx = await seedZZTest({ label: 'ZZTEST Numbers' })
    await loginAs(fx.sessionFor(fx.users.finance))
    const inv = await invoice(fx, 30)
    const first = await receipt(fx, { invoiceId: inv.id, amount: 10 })
    expect((await receipt(fx, { invoiceId: inv.id, amount: 999 })).json.code).toBe('OVERPAYMENT')
    const second = await receipt(fx, { invoiceId: inv.id, amount: 10 })
    const n = (r: { json: { receipt: { payment_number?: string; reference?: string } } }) => Number((r.json.receipt.payment_number ?? r.json.receipt.reference)!.match(/(\d+)$/)![1])
    expect(n(second)).toBe(n(first) + 1)
  })

  it('payment numbers stay consecutive across a payment refused inside its transaction', async () => {
    const { payment } = await import('../regression/actions')
    const fx = await seedZZTest({ label: 'ZZTEST Pay Numbers' })
    await loginAs(fx.sessionFor(fx.users.finance))
    const pay = () => payment(fx, { amount: 5, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id })
    const first = await pay()
    expect(first.status).toBe(201)
    // The bank's GL account is inactive: postJournal refuses inside the transaction.
    await prisma.chartOfAccount.update({ where: { id: fx.accounts.bank1.id }, data: { is_active: false } })
    expect((await pay()).status).toBe(400)
    await prisma.chartOfAccount.update({ where: { id: fx.accounts.bank1.id }, data: { is_active: true } })
    const second = await pay()
    const n = (r: { json: { payment: { reference: string } } }) => Number(r.json.payment.reference.match(/(\d+)$/)![1])
    expect(n(second)).toBe(n(first) + 1)
  })
})

describe('A9.6 bank account create honours glAccountId and saves accountName', () => {
  let fx: ZZ
  let create: (body: Record<string, unknown>) => ReturnType<typeof callRoute>
  beforeAll(async () => {
    fx = await seedZZTest({ label: 'ZZTEST Bank Create', bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
    const banks = await import('@/app/api/finance/bank-accounts/route')
    create = (body) => callRoute(banks.POST, { method: 'POST', path: '/api/finance/bank-accounts', body: { bankName: 'Stanbic', accountNumber: '9140001', accountType: 'Current', currency: 'USD', ...body } })
  })

  it('links the given ASSET account instead of creating one, and keeps accountName', async () => {
    const { default: crypto } = await import('crypto')
    const glId = crypto.randomUUID()
    await prisma.chartOfAccount.create({ data: { id: glId, companyId: fx.companyId, account_code: '1030', account_name: 'Stanbic USD', account_type: 'ASSET', is_active: true, current_balance: 0 } })
    const before = await prisma.chartOfAccount.count({ where: { companyId: fx.companyId } })
    const r = await create({ glAccountId: glId, accountName: 'Stanbic Operating', openingBalance: 250 })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    expect(r.json.account).toMatchObject({ chart_account_id: glId, account_name: 'Stanbic Operating' })
    expect(await prisma.chartOfAccount.count({ where: { companyId: fx.companyId } })).toBe(before)
    const { ledgerBalances } = await import('@/lib/reports/ledger')
    expect(Number((await ledgerBalances(prisma, fx.companyId, {})).find((a) => a.id === glId)?.balance)).toBe(250)
    expect(Number(r.json.account.current_balance)).toBe(250)
  })

  it('rejects a non-asset account, one already linked to a bank, and another company’s account', async () => {
    expect((await create({ glAccountId: fx.accounts.revenue.id })).json.code).toBe('GL_ACCOUNT_INVALID')
    expect((await create({ glAccountId: fx.accounts.bank1.id })).json.code).toBe('GL_ACCOUNT_IN_USE')
    const other = await seedZZTest({ label: 'ZZTEST Bank Other', bank1Funds: 0 })
    expect((await create({ glAccountId: other.accounts.prepaid.id })).json.code).toBe('GL_ACCOUNT_INVALID')
  })

  it('without glAccountId it still creates the GL account, and saves accountName', async () => {
    const r = await create({ accountName: 'Petty cash float' })
    expect(r.status).toBe(201)
    expect(r.json.account.account_name).toBe('Petty cash float')
    expect(r.json.account.chart_account_id).toBeTruthy()
  })
})
