import { expect } from 'vitest'
import * as journals from '@/app/api/finance/journal-entries/route'
import * as journal from '@/app/api/finance/journal-entries/[id]/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as receipts from '@/app/api/finance/receipts/route'
import * as bills from '@/app/api/finance/purchase-invoices/route'
import * as payments from '@/app/api/finance/payments/route'
import * as transfers from '@/app/api/finance/transfers/route'
import { callRoute } from '../helpers/api'
import type { ZZ } from '../fixtures/seed'

// Thin wrappers over the real route handlers, so each R-test reads as the
// behaviour it pins down.

export type Line = { accountId: string; debit?: number; credit?: number }

export const createJournal = (lines: Line[], entryDate = '2026-11-03', headers?: Record<string, string>) =>
  callRoute(journals.POST, { method: 'POST', path: '/api/finance/journal-entries', headers, body: { entryDate, description: 'Regression entry', lines: lines.map((l) => ({ debit: 0, credit: 0, ...l })) } })

export const journalAction = (id: string, action: 'post' | 'void', headers?: Record<string, string>) =>
  callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${id}?action=${action}`, params: { id }, headers })

export async function postedJournal(lines: Line[], entryDate?: string) {
  const c = await createJournal(lines, entryDate)
  expect(c.status, JSON.stringify(c.json)).toBe(201)
  const p = await journalAction(c.json.entry.id, 'post')
  expect(p.status, JSON.stringify(p.json)).toBe(200)
  return c.json.entry.id as string
}

export const invoiceBody = (fx: ZZ, over: Record<string, unknown> = {}) => ({
  customerId: fx.customers.a.id, issueDate: '2026-11-01', dueDate: '2099-12-31', revenueAccountId: fx.accounts.revenue.id,
  lineItems: [{ description: 'Guarding', quantity: 1, unitPrice: 100, taxRate: 0 }], ...over,
})

export const createInvoice = (fx: ZZ, over: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', headers, body: invoiceBody(fx, over) })

export async function invoice(fx: ZZ, amount = 100, over: Record<string, unknown> = {}) {
  const r = await createInvoice(fx, { lineItems: [{ description: 'Guarding', quantity: 1, unitPrice: amount, taxRate: 0 }], ...over })
  expect(r.status, JSON.stringify(r.json)).toBe(201)
  return r.json.invoice as { id: string; invoiceNumber?: string; invoice_number?: string }
}

export const receipt = (fx: ZZ, body: Record<string, unknown>, headers?: Record<string, string>) =>
  callRoute(receipts.POST, { method: 'POST', path: '/api/finance/receipts', headers, body: { bankAccountId: fx.banks.b1.id, receiptDate: '2026-11-05', method: 'BANK_TRANSFER', ...body } })

export const createBill = (fx: ZZ, amount = 50, over: Record<string, unknown> = {}) =>
  callRoute(bills.POST, { method: 'POST', path: '/api/finance/purchase-invoices', body: {
    supplierId: fx.supplier.id, issueDate: '2026-11-01', dueDate: '2099-12-31', expenseAccountId: fx.accounts.officeExpenses.id,
    lineItems: [{ description: 'Stationery', quantity: 1, unitPrice: amount, taxRate: 0 }], ...over,
  } })

export const payment = (fx: ZZ, body: Record<string, unknown>) =>
  callRoute(payments.POST, { method: 'POST', path: '/api/finance/payments', body: { bankAccountId: fx.banks.b1.id, paymentDate: '2026-11-06', method: 'BANK_TRANSFER', ...body } })

export const transfer = (fx: ZZ, body: Record<string, unknown>) =>
  callRoute(transfers.POST, { method: 'POST', path: '/api/finance/transfers', body: { fromAccountId: fx.banks.b1.id, toAccountId: fx.banks.b2.id, transferDate: '2026-11-07', ...body } })
