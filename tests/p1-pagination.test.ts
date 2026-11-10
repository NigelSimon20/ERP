import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as employees from '@/app/api/hr/employees/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

describe('P1-7 pagination and server-side summaries', () => {
  let fx: Fixture
  const N = 60
  beforeAll(async () => {
    fx = await seedCompany('Paging Co')
    // Same invoice_date for all: the old single-key sort let rows swap
    // between pages, so some were shown twice and others never (BUG-012).
    await prisma.salesInvoice.createMany({
      data: Array.from({ length: N }, (_, i) => ({
        id: crypto.randomUUID(), companyId: fx.companyId, customer_id: fx.customer.id, invoice_number: `INV-${String(i).padStart(4, '0')}`,
        invoice_date: '2026-11-01', due_date: i % 3 === 0 ? '2020-01-01' : '2099-01-01',
        total_amount: 100, amount_paid: i % 2 === 0 ? 100 : 25, status: i % 2 === 0 ? 'Paid' : 'Partial', currency: 'USD',
      })),
    })
    await prisma.guard.createMany({
      data: Array.from({ length: 40 }, (_, i) => ({ id: crypto.randomUUID(), companyId: fx.companyId, full_name: `Guard ${i}`, employee_code: `G-${i}`, status: i < 30 ? 'Active' as const : 'Resigned' as const, daily_rate: 5 })),
    })
    await loginAs(fx.sessionFor(fx.users.admin))
  })

  it('paging through every invoice returns each id exactly once', async () => {
    const seen: string[] = []
    for (let page = 1; page <= Math.ceil(N / 7); page++) {
      const r = await callRoute(salesInvoices.GET, { path: `/api/finance/sales-invoices?page=${page}&limit=7` })
      expect(r.json.invoices.length).toBeLessThanOrEqual(7)
      seen.push(...r.json.invoices.map((i: { id: string }) => i.id))
    }
    expect(seen).toHaveLength(N)
    expect(new Set(seen).size).toBe(N)
  })

  it('caps the page size', async () => {
    const r = await callRoute(salesInvoices.GET, { path: '/api/finance/sales-invoices?limit=100000' })
    expect(r.json.invoices.length).toBeLessThanOrEqual(100)
  })

  it('summary cards equal the SQL totals over every invoice, not page 1', async () => {
    const r = await callRoute(salesInvoices.GET, { path: '/api/finance/sales-invoices?limit=1' })
    // 30 paid in full, 30 owing 75 each; 20 of all 60 are past due, 10 of
    // those still owe (i % 3 === 0 and odd).
    expect(r.json.summary).toEqual({ count: N, totalInvoiced: 6000, totalPaid: 3750, outstanding: 2250, overdue: 750 })
  })

  it('HR overview counts are company-wide (BUG-015)', async () => {
    const r = await callRoute(employees.GET, { path: '/api/hr/employees?limit=5' })
    expect(r.json.guards).toHaveLength(5)
    // Fixture adds 1 active + 1 resigned guard to the 40 above.
    expect(r.json.summary).toEqual({ totalHeadcount: 42, totalActive: 31, avgDailyRate: expect.any(Number) })
  })
})
