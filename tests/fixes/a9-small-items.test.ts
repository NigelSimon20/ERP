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
