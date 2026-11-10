import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import * as creditNotes from '@/app/api/finance/credit-notes/route'
import * as creditNote from '@/app/api/finance/credit-notes/[id]/route'
import * as debitNotes from '@/app/api/finance/debit-notes/route'
import * as debitNote from '@/app/api/finance/debit-notes/[id]/route'
import * as proformas from '@/app/api/finance/proforma-invoices/route'
import * as proforma from '@/app/api/finance/proforma-invoices/[id]/route'
import * as purchaseOrders from '@/app/api/finance/purchase-orders/route'
import * as purchaseOrder from '@/app/api/finance/purchase-orders/[id]/route'
import * as grns from '@/app/api/finance/goods-received-notes/route'
import * as expenseClaims from '@/app/api/hr/expense-claims/route'
import * as expenseClaim from '@/app/api/hr/expense-claims/[id]/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

// BUG-025: these tables' status columns were TEXT while the client cast to
// Postgres enums, so every create failed with 42704. Each test runs the
// document through its real lifecycle against a database built purely from
// prisma/migrations.
const line = { description: 'Guarding services', quantity: 2, unitPrice: 50, taxRate: 0 }

async function journalBalanced(journalEntryId: string | null) {
  expect(journalEntryId).toBeTruthy()
  const sums = await prisma.journalLine.aggregate({ where: { journalEntryId: journalEntryId! }, _sum: { debit: true, credit: true } })
  expect(Number(sums._sum.debit)).toBeGreaterThan(0)
  expect(Number(sums._sum.debit)).toBe(Number(sums._sum.credit))
}

describe('P0-3 document types: create → post → void', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Docs Co')
  })

  it('credit note', async () => {
    await loginAs(fx.sessionFor(fx.users.finance))
    const created = await callRoute(creditNotes.POST, { method: 'POST', path: '/api/finance/credit-notes', body: { customerId: fx.customer.id, issueDate: '2026-11-02', reason: 'Service credit', lineItems: [line] } })
    expect(created.status, JSON.stringify(created.json)).toBe(201)
    const cnId = created.json.creditNote.id
    expect(created.json.creditNote.status).toBe('DRAFT')

    const issued = await callRoute(creditNote.PUT, { method: 'PUT', path: `/api/finance/credit-notes/${cnId}?action=issue`, params: { id: cnId }, body: { revenueAccountId: fx.accounts.revenue.id } })
    expect(issued.status, JSON.stringify(issued.json)).toBe(200)
    expect(issued.json.creditNote.status).toBe('ISSUED')
    await journalBalanced(issued.json.creditNote.journalEntryId)

    const voided = await callRoute(creditNote.PUT, { method: 'PUT', path: `/api/finance/credit-notes/${cnId}?action=void`, params: { id: cnId } })
    expect(voided.status, JSON.stringify(voided.json)).toBe(200)
    expect(voided.json.creditNote.status).toBe('VOID')
  })

  it('debit note', async () => {
    await loginAs(fx.sessionFor(fx.users.finance))
    const created = await callRoute(debitNotes.POST, { method: 'POST', path: '/api/finance/debit-notes', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', reason: 'Short delivery', lineItems: [line] } })
    expect(created.status, JSON.stringify(created.json)).toBe(201)
    const dnId = created.json.debitNote.id

    const issued = await callRoute(debitNote.PUT, { method: 'PUT', path: `/api/finance/debit-notes/${dnId}?action=issue`, params: { id: dnId }, body: { expenseAccountId: fx.accounts.expense.id } })
    expect(issued.status, JSON.stringify(issued.json)).toBe(200)
    expect(issued.json.debitNote.status).toBe('ISSUED')
    await journalBalanced(issued.json.debitNote.journalEntryId)

    const voided = await callRoute(debitNote.PUT, { method: 'PUT', path: `/api/finance/debit-notes/${dnId}?action=void`, params: { id: dnId } })
    expect(voided.json.debitNote.status).toBe('VOID')
  })

  it('proforma invoice (create → sent → void, with the bodyless PUT the page sends)', async () => {
    await loginAs(fx.sessionFor(fx.users.finance))
    const created = await callRoute(proformas.POST, { method: 'POST', path: '/api/finance/proforma-invoices', body: { customerId: fx.customer.id, issueDate: '2026-11-02', validUntil: '2026-12-02', lineItems: [line] } })
    expect(created.status, JSON.stringify(created.json)).toBe(201)
    const id = created.json.proformaInvoice.id

    const sent = await callRoute(proforma.PUT, { method: 'PUT', path: `/api/finance/proforma-invoices/${id}`, params: { id }, body: { status: 'SENT' } })
    expect(sent.status, JSON.stringify(sent.json)).toBe(200)

    const voided = await callRoute(proforma.PUT, { method: 'PUT', path: `/api/finance/proforma-invoices/${id}?action=void`, params: { id } })
    expect(voided.status, JSON.stringify(voided.json)).toBe(200)
    expect((await prisma.proformaInvoice.findUniqueOrThrow({ where: { id } })).status).toBe('VOID')
  })

  it('purchase order → GRN, and a cancelled PO', async () => {
    await loginAs(fx.sessionFor(fx.users.finance))
    const created = await callRoute(purchaseOrders.POST, { method: 'POST', path: '/api/finance/purchase-orders', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', lineItems: [line] } })
    expect(created.status, JSON.stringify(created.json)).toBe(201)
    const poId = created.json.purchaseOrder.id

    const approved = await callRoute(purchaseOrder.PUT, { method: 'PUT', path: `/api/finance/purchase-orders/${poId}?action=approve`, params: { id: poId } })
    expect(approved.status, JSON.stringify(approved.json)).toBe(200)

    const poLine = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: poId } })
    const grn = await callRoute(grns.POST, { method: 'POST', path: '/api/finance/goods-received-notes', body: { purchaseOrderId: poId, receivedBy: 'Stores', lines: [{ poLineId: poLine.id, quantityReceived: 2 }] } })
    expect(grn.status, JSON.stringify(grn.json)).toBe(201)
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } })).status).toBe('RECEIVED')

    const other = await callRoute(purchaseOrders.POST, { method: 'POST', path: '/api/finance/purchase-orders', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', lineItems: [line] } })
    const cancelled = await callRoute(purchaseOrder.PUT, { method: 'PUT', path: `/api/finance/purchase-orders/${other.json.purchaseOrder.id}?action=cancel`, params: { id: other.json.purchaseOrder.id } })
    expect(cancelled.status, JSON.stringify(cancelled.json)).toBe(200)
    expect(cancelled.json.purchaseOrder.status).toBe('CANCELLED')
  })

  it('expense claim (create → approve → paid)', async () => {
    await loginAs(fx.sessionFor(fx.users.hr))
    const created = await callRoute(expenseClaims.POST, { method: 'POST', path: '/api/hr/expense-claims', body: { category: 'Transport', amount: 25, expenseDate: '2026-11-02', description: 'Site visit taxi' } })
    expect(created.status, JSON.stringify(created.json)).toBe(201)
    const id = created.json.expenseClaim.id

    // A claimant can't approve their own claim; a second user must.
    await loginAs(fx.sessionFor(fx.users.admin))
    const approved = await callRoute(expenseClaim.PUT, { method: 'PUT', path: `/api/hr/expense-claims/${id}?action=approve`, params: { id } })
    expect(approved.status, JSON.stringify(approved.json)).toBe(200)

    const paid = await callRoute(expenseClaim.PUT, { method: 'PUT', path: `/api/hr/expense-claims/${id}?action=mark-paid`, params: { id }, body: { expenseAccountId: fx.accounts.expense.id, bankAccountId: fx.bankAccount.id } })
    expect(paid.status, JSON.stringify(paid.json)).toBe(200)
    const claim = await prisma.expenseClaim.findUniqueOrThrow({ where: { id } })
    expect(claim.status).toBe('PAID')
    await journalBalanced(claim.journalEntryId)
  })
})
