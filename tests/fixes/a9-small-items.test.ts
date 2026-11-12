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
