import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deriveInvoiceStatus } from '@/lib/invoice-status'
import { getReceivables } from '@/lib/reports/subledger'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as salesInvoice from '@/app/api/finance/sales-invoices/[id]/route'
import * as receipts from '@/app/api/finance/receipts/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

async function invoice(fx: Fixture, amount: number, customerId = fx.customer.id) {
  const r = await callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', body: {
    customerId, issueDate: '2026-11-01', dueDate: '2099-12-31', revenueAccountId: fx.accounts.revenue.id,
    lineItems: [{ description: 'Guarding', quantity: 1, unitPrice: amount, taxRate: 0 }],
  } })
  expect(r.status, JSON.stringify(r.json)).toBe(201)
  return r.json.invoice.id as string
}

const receipt = (fx: Fixture, body: Record<string, unknown>, headers?: Record<string, string>) =>
  callRoute(receipts.POST, { method: 'POST', path: '/api/finance/receipts', headers, body: { bankAccountId: fx.bankAccount.id, receiptDate: '2026-11-05', method: 'BANK_TRANSFER', ...body } })

describe('P1-5 receipts and invoices', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Receipts Co')
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('10 parallel receipts on one invoice: paid = sum of receipts, and GL AR = subledger AR (BUG-027)', async () => {
    const id = await invoice(fx, 100)
    const results = await Promise.all(Array.from({ length: 10 }, () => receipt(fx, { invoiceId: id, amount: 10 })))
    expect(results.map((r) => r.status), JSON.stringify(results.filter((r) => r.status !== 201).map((r) => r.json))).toEqual(Array(10).fill(201))
    const inv = await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })
    expect(Number(inv.amount_paid)).toBe(100)
    expect(Number(inv.balance_due)).toBe(0)
    const ar = await getReceivables(prisma, fx.companyId)
    expect(ar.total.toFixed(2)).toBe('0.00')
    expect(ar.difference?.toFixed(2)).toBe('0.00')
    // An 11th receipt would overpay.
    const over = await receipt(fx, { invoiceId: id, amount: 10 })
    expect(over.status).toBe(400)
    expect(over.json.code).toBe('OVERPAYMENT')
  })

  it("rejects a receipt whose customer isn't the invoice's customer (BUG-028)", async () => {
    const otherCustomer = { id: crypto.randomUUID(), companyId: fx.companyId, company_name: 'Dr Mlilo', is_active: true }
    await prisma.customer.create({ data: otherCustomer })
    const id = await invoice(fx, 50)
    const r = await receipt(fx, { invoiceId: id, customerId: otherCustomer.id, amount: 10 })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('CUSTOMER_MISMATCH')
    // Without a customer, the receipt takes the invoice's.
    const ok = await receipt(fx, { invoiceId: id, amount: 10 })
    expect(ok.status).toBe(201)
    expect(ok.json.receipt.customer_id).toBe(fx.customer.id)
  })

  it('refuses to void an invoice that has receipts allocated (BUG-026)', async () => {
    const id = await invoice(fx, 100)
    expect((await receipt(fx, { invoiceId: id, amount: 100 })).status).toBe(201)
    const v = await callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${id}?action=void`, params: { id } })
    expect(v.status, JSON.stringify(v.json)).toBe(409)
    expect(v.json.code).toBe('HAS_ALLOCATIONS')
    expect(['Void', 'VOID']).not.toContain((await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })).status)
  })

  it('still voids an invoice with nothing allocated', async () => {
    const id = await invoice(fx, 75)
    const v = await callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${id}?action=void`, params: { id } })
    expect(v.status, JSON.stringify(v.json)).toBe(200)
  })

  it('an Idempotency-Key replay returns the first receipt instead of a second one', async () => {
    const id = await invoice(fx, 40)
    const key = crypto.randomUUID()
    const [a, b] = await Promise.all([receipt(fx, { invoiceId: id, amount: 15 }, { 'idempotency-key': key }), receipt(fx, { invoiceId: id, amount: 15 }, { 'idempotency-key': key })])
    const statuses = [a.status, b.status].sort()
    expect(statuses[0]).toBe(201)
    expect([201, 409]).toContain(statuses[1])
    const replay = await receipt(fx, { invoiceId: id, amount: 15 }, { 'idempotency-key': key })
    expect(replay.status).toBe(201)
    expect(replay.headers.get('idempotent-replay')).toBe('true')
    expect(Number((await prisma.salesInvoice.findUniqueOrThrow({ where: { id } })).amount_paid)).toBe(15)
  })

  it('rejects a receipt into a bank account with no GL account', async () => {
    const bank = { id: crypto.randomUUID(), companyId: fx.companyId, account_name: 'Unlinked', chart_account_id: null, currency: 'USD', is_active: true }
    await prisma.bankAccount.create({ data: bank })
    const r = await receipt(fx, { bankAccountId: bank.id, amount: 5 })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('BANK_NOT_LINKED')
  })

  it('document numbers are unique per company at the database level (BUG-008)', async () => {
    const base = { companyId: fx.companyId, payment_number: 'REC00037', payment_type: 'Customer Receipt', amount: 1 }
    await prisma.payment.create({ data: { id: crypto.randomUUID(), ...base } })
    const err = await prisma.payment.create({ data: { id: crypto.randomUUID(), ...base } }).catch((e) => e)
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(err.code).toBe('P2002')
  })
})

describe('P1-5 invoice status is derived from the amounts (BUG-009 / BUG-033)', () => {
  it.each([
    [{ total: 100, paid: 0, voided: true }, 'VOID'],
    [{ total: 100, paid: 100, voided: false }, 'PAID'],
    [{ total: 100, paid: 120, voided: false }, 'PAID'],
    [{ total: 7491.91, paid: 0, dueDate: '2099-01-01', voided: false }, 'UNPAID'],
    [{ total: 100, paid: 40, dueDate: '2099-01-01', voided: false }, 'PARTIAL'],
    [{ total: 100, paid: 40, dueDate: '2020-01-01', voided: false }, 'OVERDUE'],
  ])('%j -> %s', (inv, expected) => {
    expect(deriveInvoiceStatus(inv)).toBe(expected)
  })
})
