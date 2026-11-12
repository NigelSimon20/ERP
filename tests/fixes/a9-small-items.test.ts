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
