import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as receipts from '@/app/api/finance/receipts/route'
import * as payments from '@/app/api/finance/payments/route'
import * as journals from '@/app/api/finance/journal-entries/route'
import * as creditNotes from '@/app/api/finance/credit-notes/route'
import * as transfers from '@/app/api/finance/transfers/route'
import * as payroll from '@/app/api/hr/payroll/route'
import { pruneIdempotencyKeys } from '@/lib/idempotency'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoiceBody } from '../regression/actions'
import { assertLedgerInvariants } from '../regression/invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

// A7: the same Idempotency-Key created INV-000006 and INV-000007.
describe('A7 Idempotency-Key on create endpoints', () => {
  let fx: ZZ
  const key = () => crypto.randomUUID()
  const post = (handler: typeof salesInvoices.POST, path: string, body: unknown, k?: string) =>
    callRoute(handler, { method: 'POST', path, body, headers: k ? { 'idempotency-key': k } : undefined })

  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 5000 })
    for (const g of fx.guards) await prisma.attendance.create({ data: { id: crypto.randomUUID(), guardId: g.id, date: new Date(Date.UTC(2026, 10, 2)), status: 'PRESENT' } })
    await loginAs(fx.sessionFor(fx.users.admin))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('same key + same body -> the first response is replayed; only one invoice exists', async () => {
    const k = key()
    const a = await post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx), k)
    const b = await post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx), k)
    expect([a.status, b.status]).toEqual([201, 201])
    expect(b.json.invoice.id).toBe(a.json.invoice.id)
    expect(b.headers.get('idempotent-replay')).toBe('true')
    expect(await prisma.salesInvoice.count({ where: { companyId: fx.companyId, invoice_number: a.json.invoice.invoiceNumber } })).toBe(1)
  })

  it('same key + different body -> 422 IDEMPOTENCY_MISMATCH, also across endpoints', async () => {
    const k = key()
    expect((await post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx), k)).status).toBe(201)
    const changed = await post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx, { notes: 'different' }), k)
    expect([changed.status, changed.json.code]).toEqual([422, 'IDEMPOTENCY_MISMATCH'])
    const elsewhere = await post(payments.POST, '/api/finance/payments', { bankAccountId: fx.banks.b1.id, paymentDate: '2026-11-06', amount: 1, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id }, k)
    expect([elsewhere.status, elsewhere.json.code]).toEqual([422, 'IDEMPOTENCY_MISMATCH'])
  })

  it('two parallel requests with one key create one document', async () => {
    const k = key()
    const before = await prisma.salesInvoice.count({ where: { companyId: fx.companyId } })
    const rs = await Promise.all([1, 2, 3].map(() => post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx), k)))
    expect(rs.filter((r) => r.status === 201 && r.headers.get('idempotent-replay') !== 'true')).toHaveLength(1)
    for (const r of rs) expect([201, 409]).toContain(r.status)
    expect(await prisma.salesInvoice.count({ where: { companyId: fx.companyId } })).toBe(before + 1)
  })

  it('a key older than 24h is forgotten and pruned', async () => {
    const k = key()
    const a = await post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx), k)
    await prisma.idempotencyKey.updateMany({ where: { companyId: fx.companyId, key: k }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } })
    const b = await post(salesInvoices.POST, '/api/finance/sales-invoices', invoiceBody(fx), k)
    expect(b.status).toBe(201)
    expect(b.json.invoice.id).not.toBe(a.json.invoice.id)
    await prisma.idempotencyKey.updateMany({ where: { companyId: fx.companyId }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } })
    expect(await pruneIdempotencyKeys()).toBeGreaterThan(0)
    expect(await prisma.idempotencyKey.count({ where: { companyId: fx.companyId } })).toBe(0)
  })

  it.each([
    ['receipts', () => receipts.POST, '/api/finance/receipts', (fx: ZZ) => ({ bankAccountId: fx.banks.b1.id, receiptDate: '2026-11-05', method: 'BANK_TRANSFER', customerId: fx.customers.a.id, amount: 3 }), () => prisma.payment.count({ where: { payment_type: 'Customer Receipt' } })],
    ['payments', () => payments.POST, '/api/finance/payments', (fx: ZZ) => ({ bankAccountId: fx.banks.b1.id, paymentDate: '2026-11-06', amount: 2, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id }), () => prisma.payment.count({ where: { payment_type: 'Expense Payment' } })],
    ['journals', () => journals.POST, '/api/finance/journal-entries', (fx: ZZ) => ({ entryDate: '2026-11-03', description: 'Idempotent entry', lines: [{ accountId: fx.accounts.prepaid.id, debit: 4, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 4 }] }), () => prisma.journalEntry.count()],
    ['credit notes', () => creditNotes.POST, '/api/finance/credit-notes', (fx: ZZ) => ({ customerId: fx.customers.a.id, issueDate: '2026-11-02', reason: 'Credit', lineItems: [{ description: 'x', quantity: 1, unitPrice: 5, taxRate: 0 }] }), () => prisma.creditNote.count()],
    ['transfers', () => transfers.POST, '/api/finance/transfers', (fx: ZZ) => ({ fromAccountId: fx.banks.b1.id, toAccountId: fx.banks.b2.id, transferDate: '2026-11-07', amount: 6 }), () => prisma.bankTransfer.count()],
    ['payroll confirm', () => payroll.POST, '/api/hr/payroll?action=confirm', (fx: ZZ) => ({ periodStart: '2026-11-01', periodEnd: '2026-11-30', bankAccountId: fx.banks.b1.id }), () => prisma.payrollRun.count()],
  ])('%s: a retried request with the same key creates nothing new', async (_name, handler, path, body, count) => {
    const k = key()
    const first = await post(handler() as typeof salesInvoices.POST, path, body(fx), k)
    expect(first.status, JSON.stringify(first.json)).toBe(201)
    const n = await count()
    const again = await post(handler() as typeof salesInvoices.POST, path, body(fx), k)
    expect(again.status).toBe(201)
    expect(again.headers.get('idempotent-replay')).toBe('true')
    expect(await count()).toBe(n)
  })
})
