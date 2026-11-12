import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ledgerBalances } from '@/lib/reports/ledger'
import * as creditNotes from '@/app/api/finance/credit-notes/route'
import * as creditNote from '@/app/api/finance/credit-notes/[id]/route'
import * as debitNotes from '@/app/api/finance/debit-notes/route'
import * as debitNote from '@/app/api/finance/debit-notes/[id]/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as salesInvoice from '@/app/api/finance/sales-invoices/[id]/route'
import * as bill from '@/app/api/finance/purchase-invoices/[id]/route'
import * as customers from '@/app/api/finance/customers/route'
import * as suppliers from '@/app/api/finance/suppliers/route'
import * as financeDashboard from '@/app/api/dashboard/finance/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoice, receipt, createBill, payment } from '../regression/actions'
import { assertLedgerInvariants } from '../regression/invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

const vatLine = (unitPrice: number) => ({ description: 'Guarding', quantity: 1, unitPrice, taxRate: 15.5 })

// A2: a credit note against INV-x posted to the GL but left the invoice and
// the customer's balance unchanged (310.50 owed per customers vs 298.95 in GL).
describe('A2 credit notes are applied to their invoice', () => {
  let fx: ZZ
  const gl = async (id: string) => Number((await ledgerBalances(prisma, fx.companyId, {})).find((a) => a.id === id)?.balance ?? 0)
  const createCn = (body: Record<string, unknown>) =>
    callRoute(creditNotes.POST, { method: 'POST', path: '/api/finance/credit-notes', body: { issueDate: '2026-11-02', reason: 'Service credit', ...body } })
  const issueCn = (id: string) =>
    callRoute(creditNote.PUT, { method: 'PUT', path: `/api/finance/credit-notes/${id}?action=issue`, params: { id }, body: { revenueAccountId: fx.accounts.revenue.id } })
  const voidCn = (id: string) => callRoute(creditNote.PUT, { method: 'PUT', path: `/api/finance/credit-notes/${id}?action=void`, params: { id } })
  const inv = (id: string) => prisma.salesInvoice.findUniqueOrThrow({ where: { id } })

  async function receivablesEverywhere() {
    const [list, sums, dash] = await Promise.all([
      callRoute(customers.GET, { path: '/api/finance/customers' }),
      callRoute(salesInvoices.GET, { path: '/api/finance/sales-invoices?limit=1' }),
      callRoute(financeDashboard.GET, { path: '/api/dashboard/finance' }),
    ])
    const customerTotal = Math.round(list.json.customers.reduce((s: number, c: { outstandingBal: number }) => s + c.outstandingBal * 100, 0)) / 100
    return { customerTotal, invoiceSummary: sums.json.summary.outstanding, dashboard: dash.json.outstandingReceivables, gl: await gl(fx.accounts.receivables.id) }
  }

  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('accepts invoiceId, takes the customer from the invoice, and rejects a mismatch', async () => {
    const i = await invoice(fx, 50)
    const viaInvoiceId = await createCn({ invoiceId: i.id, lineItems: [vatLine(1)] })
    expect(viaInvoiceId.status, JSON.stringify(viaInvoiceId.json)).toBe(201)
    expect(viaInvoiceId.json.creditNote).toMatchObject({ salesInvoiceId: i.id, customerId: fx.customers.a.id })
    const mismatch = await createCn({ invoiceId: i.id, customerId: fx.customers.b.id, lineItems: [vatLine(1)] })
    expect([mismatch.status, mismatch.json.code]).toEqual([400, 'CUSTOMER_MISMATCH'])
    const other = await seedZZTest({ label: 'ZZTEST A2 Other', bank1Funds: 0 })
    await loginAs(other.sessionFor(other.users.finance))
    const foreignInvoice = (await invoice(other, 5)).id
    await loginAs(fx.sessionFor(fx.users.finance))
    expect((await createCn({ invoiceId: foreignInvoice, lineItems: [vatLine(1)] })).status).toBe(404)
  })

  let invoiceId: string
  let cnId: string
  it('11.55 credit on a 115.50 invoice -> balance 103.95; customer list = invoice summary = GL 1100 = dashboard AR', async () => {
    const r = await callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', body: {
      customerId: fx.customers.b.id, issueDate: '2026-11-01', dueDate: '2099-12-31', revenueAccountId: fx.accounts.revenue.id, lineItems: [vatLine(100)],
    } })
    invoiceId = r.json.invoice.id
    expect(r.json.invoice.totalAmount).toBe(115.5)
    const before = await receivablesEverywhere()
    const cn = await createCn({ salesInvoiceId: invoiceId, lineItems: [vatLine(10)] })
    cnId = cn.json.creditNote.id
    expect(Number(cn.json.creditNote.totalAmount)).toBe(11.55)
    expect((await issueCn(cnId)).status).toBe(200)
    const stored = await inv(invoiceId)
    expect([Number(stored.credited_amount), Number(stored.balance_due)]).toEqual([11.55, 103.95])
    expect(Number((await prisma.creditNote.findUniqueOrThrow({ where: { id: cnId } })).allocatedAmount)).toBe(11.55)
    const after = await receivablesEverywhere()
    expect(after.gl).toBe(Math.round((before.gl - 11.55) * 100) / 100)
    expect(after).toEqual({ customerTotal: after.gl, invoiceSummary: after.gl, dashboard: after.gl, gl: after.gl })
    expect(stored.status).toBe('PARTIAL')
    const listed = await callRoute(salesInvoices.GET, { path: `/api/finance/sales-invoices?customerId=${fx.customers.b.id}` })
    expect(listed.json.invoices.find((x: { id: string }) => x.id === invoiceId)).toMatchObject({ status: 'PARTIAL', balanceDue: 103.95 })
  })

  it('an invoice with a credit note applied cannot be voided -> 409 HAS_ALLOCATIONS', async () => {
    const v = await callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${invoiceId}?action=void`, params: { id: invoiceId } })
    expect([v.status, v.json.code]).toEqual([409, 'HAS_ALLOCATIONS'])
  })

  it('a receipt can only settle what is left after the credit', async () => {
    expect((await receipt(fx, { invoiceId, amount: 103.96 })).json.code).toBe('OVERPAYMENT')
    expect((await receipt(fx, { invoiceId, amount: 103.95 })).status).toBe(201)
    const stored = await inv(invoiceId)
    expect(Number(stored.balance_due)).toBe(0)
    expect(stored.status).toBe('PAID')
  })

  it('voiding the credit note reverses its allocation', async () => {
    const i = await invoice(fx, 80)
    const cn = await createCn({ salesInvoiceId: i.id, lineItems: [{ description: 'x', quantity: 1, unitPrice: 30, taxRate: 0 }] })
    await issueCn(cn.json.creditNote.id)
    expect(Number((await inv(i.id)).balance_due)).toBe(50)
    expect((await voidCn(cn.json.creditNote.id)).status).toBe(200)
    const stored = await inv(i.id)
    expect([Number(stored.credited_amount), Number(stored.balance_due)]).toEqual([0, 80])
    const all = await receivablesEverywhere()
    expect(all.customerTotal).toBe(all.gl)
  })

  it('a credit above the balance is rejected while the setting is off, and leaves the excess as unapplied credit when on', async () => {
    const i = await invoice(fx, 20)
    const big = await createCn({ salesInvoiceId: i.id, lineItems: [{ description: 'x', quantity: 1, unitPrice: 25, taxRate: 0 }] })
    const rejected = await issueCn(big.json.creditNote.id)
    expect([rejected.status, rejected.json.code]).toEqual([400, 'CREDIT_EXCEEDS_BALANCE'])
    expect((await prisma.creditNote.findUniqueOrThrow({ where: { id: big.json.creditNote.id } })).status).toBe('DRAFT')

    await prisma.company.update({ where: { id: fx.companyId }, data: { allowUnappliedCredit: true } })
    expect((await issueCn(big.json.creditNote.id)).status).toBe(200)
    expect(Number((await inv(i.id)).balance_due)).toBe(0)
    expect(Number((await prisma.creditNote.findUniqueOrThrow({ where: { id: big.json.creditNote.id } })).allocatedAmount)).toBe(20)
    const all = await receivablesEverywhere()
    expect(all.customerTotal).toBe(all.gl)
    expect(all.dashboard).toBe(all.gl)
    await prisma.company.update({ where: { id: fx.companyId }, data: { allowUnappliedCredit: false } })
  })
})

describe('A2 debit notes are applied to their bill', () => {
  let fx: ZZ
  const gl = async (id: string) => Number((await ledgerBalances(prisma, fx.companyId, {})).find((a) => a.id === id)?.balance ?? 0)
  const createDn = (body: Record<string, unknown>) =>
    callRoute(debitNotes.POST, { method: 'POST', path: '/api/finance/debit-notes', body: { supplierId: fx.supplier.id, issueDate: '2026-11-02', reason: 'Short delivery', ...body } })
  const issueDn = (id: string) =>
    callRoute(debitNote.PUT, { method: 'PUT', path: `/api/finance/debit-notes/${id}?action=issue`, params: { id }, body: { expenseAccountId: fx.accounts.officeExpenses.id } })
  const supplierTotal = async () => (await callRoute(suppliers.GET, { path: '/api/finance/suppliers' })).json.suppliers.reduce((s: number, x: { outstandingBal: number }) => s + x.outstandingBal, 0)

  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('a 10 debit note on a 50 bill -> balance 40; supplier list = GL 2000; payment limited to the new balance; bill cannot be voided', async () => {
    const b = await createBill(fx, 50)
    const billId = b.json.invoice.id
    const dn = await createDn({ invoiceId: billId, lineItems: [{ description: 'Short', quantity: 1, unitPrice: 10, taxRate: 0 }] })
    expect(dn.status, JSON.stringify(dn.json)).toBe(201)
    expect(dn.json.debitNote.purchaseInvoiceId).toBe(billId)
    expect((await issueDn(dn.json.debitNote.id)).status).toBe(200)
    const stored = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: billId } })
    expect([Number(stored.creditedAmount), Number(stored.balanceDue)]).toEqual([10, 40])
    expect(await supplierTotal()).toBe(await gl(fx.accounts.payables.id))
    expect((await payment(fx, { amount: 40.01, entityType: 'PURCHASE_INVOICE', entityId: billId })).status).toBe(400)
    const v = await callRoute(bill.POST, { method: 'POST', path: `/api/finance/purchase-invoices/${billId}?action=void`, params: { id: billId } })
    expect(v.status).toBe(409)
    expect(v.json.code).toBe('HAS_ALLOCATIONS')
    expect((await payment(fx, { amount: 40, entityType: 'PURCHASE_INVOICE', entityId: billId })).status).toBe(201)
    expect((await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: billId } })).status).toBe('PAID')
  })

  it('voiding a debit note restores the bill; an over-balance debit note follows the setting', async () => {
    const b = await createBill(fx, 30)
    const billId = b.json.invoice.id
    const small = await createDn({ purchaseInvoiceId: billId, lineItems: [{ description: 'x', quantity: 1, unitPrice: 5, taxRate: 0 }] })
    await issueDn(small.json.debitNote.id)
    expect(Number((await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: billId } })).balanceDue)).toBe(25)
    expect((await callRoute(debitNote.PUT, { method: 'PUT', path: `/api/finance/debit-notes/${small.json.debitNote.id}?action=void`, params: { id: small.json.debitNote.id } })).status).toBe(200)
    expect(Number((await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: billId } })).balanceDue)).toBe(30)

    const big = await createDn({ purchaseInvoiceId: billId, lineItems: [{ description: 'x', quantity: 1, unitPrice: 31, taxRate: 0 }] })
    expect((await issueDn(big.json.debitNote.id)).json.code).toBe('CREDIT_EXCEEDS_BALANCE')
    expect(await supplierTotal()).toBe(await gl(fx.accounts.payables.id))
  })

  it('an unapplied debit note (no bill) still reduces what the supplier is owed', async () => {
    const dn = await createDn({ lineItems: [{ description: 'Rebate', quantity: 1, unitPrice: 4, taxRate: 0 }] })
    expect((await issueDn(dn.json.debitNote.id)).status).toBe(200)
    expect(await supplierTotal()).toBe(await gl(fx.accounts.payables.id))
  })
})
