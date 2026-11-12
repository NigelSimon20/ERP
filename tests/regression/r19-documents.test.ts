import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import * as creditNotes from '@/app/api/finance/credit-notes/route'
import * as debitNotes from '@/app/api/finance/debit-notes/route'
import * as proformas from '@/app/api/finance/proforma-invoices/route'
import * as purchaseOrders from '@/app/api/finance/purchase-orders/route'
import * as purchaseOrder from '@/app/api/finance/purchase-orders/[id]/route'
import * as grns from '@/app/api/finance/goods-received-notes/route'
import * as expenseClaims from '@/app/api/hr/expense-claims/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { createBill, payment, transfer } from './actions'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

const line = { description: 'Item', quantity: 2, unitPrice: 50, taxRate: 0 }

describe('Regression R19–R21: documents, GRNs, transfers and payments', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  async function approvedPo(quantity = 2) {
    const c = await callRoute(purchaseOrders.POST, { method: 'POST', path: '/api/finance/purchase-orders', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', lineItems: [{ ...line, quantity }] } })
    expect(c.status, JSON.stringify(c.json)).toBe(201)
    const id = c.json.purchaseOrder.id
    const a = await callRoute(purchaseOrder.PUT, { method: 'PUT', path: `/api/finance/purchase-orders/${id}?action=approve`, params: { id } })
    expect(a.status, JSON.stringify(a.json)).toBe(200)
    const poLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: id } })
    return { id, poLineId: poLine.id }
  }
  const receive = (poId: string, poLineId: string, quantityReceived: number) =>
    callRoute(grns.POST, { method: 'POST', path: '/api/finance/goods-received-notes', body: { purchaseOrderId: poId, receivedBy: 'Stores', lines: [{ poLineId, quantityReceived }] } })

  it.each([
    ['credit note', () => callRoute(creditNotes.POST, { method: 'POST', path: '/api/finance/credit-notes', body: { customerId: fx.customers.a.id, issueDate: '2026-11-02', reason: 'Credit', lineItems: [line] } })],
    ['debit note', () => callRoute(debitNotes.POST, { method: 'POST', path: '/api/finance/debit-notes', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', reason: 'Short delivery', lineItems: [line] } })],
    ['proforma', () => callRoute(proformas.POST, { method: 'POST', path: '/api/finance/proforma-invoices', body: { customerId: fx.customers.a.id, issueDate: '2026-11-02', validUntil: '2026-12-02', lineItems: [line] } })],
    ['purchase order', () => callRoute(purchaseOrders.POST, { method: 'POST', path: '/api/finance/purchase-orders', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', lineItems: [line] } })],
    ['bill', () => createBill(fx, 30)],
    ['expense claim', () => callRoute(expenseClaims.POST, { method: 'POST', path: '/api/hr/expense-claims', body: { category: 'Transport', amount: 25, expenseDate: '2026-11-02', description: 'Taxi to site' } })],
  ])('R19: %s -> 201', async (_name, create) => {
    const r = await create()
    expect(r.status, JSON.stringify(r.json)).toBe(201)
  })

  it('R19: an approved PO can be received with a GRN -> 201', async () => {
    const po = await approvedPo()
    expect((await receive(po.id, po.poLineId, 2)).status).toBe(201)
  })

  it('R20: over-receipt rejected; receiving again after a full receipt rejected; the PO becomes RECEIVED', async () => {
    const po = await approvedPo(3)
    const over = await receive(po.id, po.poLineId, 4)
    expect(over.status).toBeGreaterThanOrEqual(400)
    expect(over.status).toBeLessThan(500)
    expect((await receive(po.id, po.poLineId, 3)).status).toBe(201)
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe('RECEIVED')
    const again = await receive(po.id, po.poLineId, 1)
    expect(again.status).toBeGreaterThanOrEqual(400)
    expect(again.status).toBeLessThan(500)
  })

  it('R21: a transfer to the same account is rejected', async () => {
    expect((await transfer(fx, { toAccountId: fx.banks.b1.id, amount: 1 })).status).toBe(400)
  })

  it('R21: a transfer or payment larger than the bank balance is rejected', async () => {
    expect((await transfer(fx, { fromAccountId: fx.banks.b2.id, toAccountId: fx.banks.b1.id, amount: 5 })).status).toBe(400)
    expect((await payment(fx, { bankAccountId: fx.banks.b2.id, amount: 5, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id })).status).toBe(400)
  })

  it('R21: a payment linked to a bill above its balance is rejected', async () => {
    const b = await createBill(fx, 40)
    const r = await payment(fx, { amount: 40.01, entityType: 'PURCHASE_INVOICE', entityId: b.json.invoice.id })
    expect(r.status).toBe(400)
  })
})
