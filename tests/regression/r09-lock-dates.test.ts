import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as lockDates from '@/app/api/finance/lock-dates/route'
import * as salesInvoice from '@/app/api/finance/sales-invoices/[id]/route'
import * as bill from '@/app/api/finance/purchase-invoices/[id]/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { createJournal, journalAction, postedJournal, invoice, createInvoice, createBill, payment, transfer } from './actions'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Regression R9: lock dates block create, post and void', () => {
  let fx: ZZ
  const oct = '2026-10-15'
  const docs = {} as { draft: string; posted: string; invoice: string; bill: string }

  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
    // October documents made while the period is still open.
    const d = await createJournal([{ accountId: fx.accounts.prepaid.id, debit: 5 }, { accountId: fx.accounts.revenue.id, credit: 5 }], oct)
    docs.draft = d.json.entry.id
    docs.posted = await postedJournal([{ accountId: fx.accounts.prepaid.id, debit: 5 }, { accountId: fx.accounts.revenue.id, credit: 5 }], oct)
    docs.invoice = (await invoice(fx, 40, { issueDate: oct })).id
    const b = await createBill(fx, 20, { issueDate: oct })
    expect(b.status, JSON.stringify(b.json)).toBe(201)
    docs.bill = (b.json.invoice ?? b.json.bill ?? b.json.purchaseInvoice).id

    const lock = await callRoute(lockDates.POST, { method: 'POST', path: '/api/finance/lock-dates', body: { lockedUntil: '2026-10-31', reason: 'October closed' } })
    expect(lock.status, JSON.stringify(lock.json)).toBe(201)
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it.each([
    ['journal create', () => createJournal([{ accountId: fx.accounts.prepaid.id, debit: 1 }, { accountId: fx.accounts.revenue.id, credit: 1 }], oct)],
    ['journal post', () => journalAction(docs.draft, 'post')],
    ['journal void', () => journalAction(docs.posted, 'void')],
    ['invoice create', () => createInvoice(fx, { issueDate: oct, dueDate: '2026-12-31' })],
    ['invoice void', () => callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${docs.invoice}?action=void`, params: { id: docs.invoice } })],
    ['bill create', () => createBill(fx, 10, { issueDate: oct })],
    ['bill void', () => callRoute(bill.POST, { method: 'POST', path: `/api/finance/purchase-invoices/${docs.bill}?action=void`, params: { id: docs.bill } })],
    ['payment create', () => payment(fx, { paymentDate: oct, amount: 1, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id })],
    ['transfer create', () => transfer(fx, { transferDate: oct, amount: 1 })],
  ])('%s in October -> 422 PERIOD_LOCKED', async (_name, act) => {
    const r = await act()
    expect({ status: r.status, code: r.json?.code }, JSON.stringify(r.json)).toEqual({ status: 422, code: 'PERIOD_LOCKED' })
  })
})
