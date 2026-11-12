import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import * as salesInvoice from '@/app/api/finance/sales-invoices/[id]/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { createInvoice, invoice, receipt } from './actions'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

const line = (over: Record<string, unknown> = {}) => ({ description: 'Guarding', quantity: 1, unitPrice: 100, taxRate: 0, ...over })

describe('Regression R10–R15: invoices and receipts', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('R10: 2 x 100 @ 15.5% -> total 231; Dr 1100 231 / Cr 4100 200 / Cr 2100 31; single-prefix reference', async () => {
    const r = await createInvoice(fx, { lineItems: [line({ quantity: 2, taxRate: 15.5 })] })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    expect(r.json.invoice.totalAmount).toBe(231)
    const je = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fx.companyId, source_id: r.json.invoice.id } })
    expect(je.reference).toMatch(/^JE-auto-INV-\d/)
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: je.id } })
    const by = (id: string) => lines.filter((l) => l.accountId === id).map((l) => [Number(l.debit), Number(l.credit)])
    expect(by(fx.accounts.receivables.id)).toEqual([[231, 0]])
    expect(by(fx.accounts.revenue.id)).toEqual([[0, 200]])
    expect(by(fx.accounts.vat.id)).toEqual([[0, 31]])
  })

  it.each([
    ['unit price 0', { lineItems: [line({ unitPrice: 0 })] }],
    ['negative quantity', { lineItems: [line({ quantity: -1 })] }],
    ['tax rate above 100', { lineItems: [line({ taxRate: 101 })] }],
    ['no lines', { lineItems: [] }],
    ['due date before the issue date', { issueDate: '2026-11-10', dueDate: '2026-11-01' }],
  ])('R11: %s -> 400', async (_name, over) => {
    const r = await createInvoice(fx, over)
    expect(r.status, JSON.stringify(r.json)).toBe(400)
  })

  it('R12: two simultaneous invoices get different numbers', async () => {
    const [a, b] = await Promise.all([createInvoice(fx), createInvoice(fx)])
    expect([a.status, b.status]).toEqual([201, 201])
    expect(a.json.invoice.invoiceNumber).toBeTruthy()
    expect(a.json.invoice.invoiceNumber).not.toBe(b.json.invoice.invoiceNumber)
  })

  it('R13: 10 simultaneous $1 receipts on one invoice -> paid +10, bank +10', async () => {
    const inv = await invoice(fx, 50)
    const bankBefore = Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: fx.banks.b1.id } })).current_balance)
    const results = await Promise.all(Array.from({ length: 10 }, () => receipt(fx, { invoiceId: inv.id, amount: 1 })))
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201))
    expect(Number((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: inv.id } })).amount_paid)).toBe(10)
    const bankAfter = Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: fx.banks.b1.id } })).current_balance)
    expect(bankAfter - bankBefore).toBe(10)
  })

  it('R14: overpayment -> OVERPAYMENT; wrong customer -> CUSTOMER_MISMATCH; amount <= 0 -> 400', async () => {
    const inv = await invoice(fx, 30)
    const over = await receipt(fx, { invoiceId: inv.id, amount: 30.01 })
    expect([over.status, over.json.code]).toEqual([400, 'OVERPAYMENT'])
    const wrong = await receipt(fx, { invoiceId: inv.id, customerId: fx.customers.b.id, amount: 5 })
    expect([wrong.status, wrong.json.code]).toEqual([400, 'CUSTOMER_MISMATCH'])
    for (const amount of [0, -5]) expect((await receipt(fx, { invoiceId: inv.id, amount })).status).toBe(400)
  })

  it('R15: an invoice with a receipt cannot be voided -> 409 HAS_ALLOCATIONS', async () => {
    const inv = await invoice(fx, 20)
    expect((await receipt(fx, { invoiceId: inv.id, amount: 20 })).status).toBe(201)
    const v = await callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${inv.id}?action=void`, params: { id: inv.id } })
    expect([v.status, v.json.code]).toEqual([409, 'HAS_ALLOCATIONS'])
  })
})
