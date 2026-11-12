import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { ledgerBalances } from '@/lib/reports/ledger'
import { getPayables } from '@/lib/reports/subledger'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs } from '../helpers/api'
import { createBill, payment } from '../regression/actions'
import { assertLedgerInvariants } from '../regression/invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

// A1: an untyped payment used to post Dr AP / Cr bank without reducing any
// bill, so GL 2000 drifted from what suppliers were owed (-23.80 vs 26.20).
describe('A1 every payment says what it pays for', () => {
  let fx: ZZ
  const gl = async () => new Map((await ledgerBalances(prisma, fx.companyId, {})).map((a) => [a.id, Number(a.balance)]))
  const linesOf = async (journalEntryId: string | null) => {
    expect(journalEntryId).toBeTruthy()
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: journalEntryId! } })
    return lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit), credit: Number(l.credit) }))
  }

  beforeAll(async () => {
    fx = await seedZZTest()
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it.each([
    ['no entityType', {}],
    ['an unknown entityType', { entityType: 'GENERAL' }],
  ])('%s -> 400 PAYMENT_TYPE_REQUIRED, nothing posted', async (_name, body) => {
    const journalsBefore = await prisma.journalEntry.count({ where: { companyId: fx.companyId } })
    const r = await payment(fx, { amount: 10, ...body })
    expect([r.status, r.json.code], JSON.stringify(r.json)).toEqual([400, 'PAYMENT_TYPE_REQUIRED'])
    expect(await prisma.journalEntry.count({ where: { companyId: fx.companyId } })).toBe(journalsBefore)
  })

  it.each([
    ['PURCHASE_INVOICE without entityId', { entityType: 'PURCHASE_INVOICE' }],
    ['EXPENSE without expenseAccountId', { entityType: 'EXPENSE' }],
    ['SUPPLIER_ADVANCE without supplierId', { entityType: 'SUPPLIER_ADVANCE' }],
  ])('%s -> 400', async (_name, body) => {
    expect((await payment(fx, { amount: 10, ...body })).status).toBe(400)
  })

  it('PURCHASE_INVOICE: Dr 2000 / Cr bank, reduces the bill, journal linked', async () => {
    const bill = await createBill(fx, 60)
    const r = await payment(fx, { amount: 25, entityType: 'PURCHASE_INVOICE', entityId: bill.json.invoice.id })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: r.json.payment.id } })
    expect(await linesOf(p.journal_entry_id)).toEqual(expect.arrayContaining([
      { accountId: fx.accounts.payables.id, debit: 25, credit: 0 },
      { accountId: fx.accounts.bank1.id, debit: 0, credit: 25 },
    ]))
    expect(Number((await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: bill.json.invoice.id } })).balanceDue)).toBe(35)
  })

  it('EXPENSE: Dr the expense account / Cr bank, journal linked', async () => {
    const r = await payment(fx, { amount: 12.5, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: r.json.payment.id } })
    expect(await linesOf(p.journal_entry_id)).toEqual(expect.arrayContaining([
      { accountId: fx.accounts.officeExpenses.id, debit: 12.5, credit: 0 },
      { accountId: fx.accounts.bank1.id, debit: 0, credit: 12.5 },
    ]))
  })

  it('SUPPLIER_ADVANCE: Dr 1450 Supplier Advances (created once) / Cr bank; AP untouched', async () => {
    const apBefore = (await gl()).get(fx.accounts.payables.id) ?? 0
    const r1 = await payment(fx, { amount: 40, entityType: 'SUPPLIER_ADVANCE', supplierId: fx.supplier.id })
    expect(r1.status, JSON.stringify(r1.json)).toBe(201)
    const r2 = await payment(fx, { amount: 5, entityType: 'SUPPLIER_ADVANCE', supplierId: fx.supplier.id })
    expect(r2.status).toBe(201)
    const advances = await prisma.chartOfAccount.findMany({ where: { companyId: fx.companyId, account_code: '1450' } })
    expect(advances).toHaveLength(1)
    expect(advances[0].account_type).toBe('ASSET')
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: r1.json.payment.id } })
    expect(p.supplier_id).toBe(fx.supplier.id)
    expect(await linesOf(p.journal_entry_id)).toEqual(expect.arrayContaining([
      { accountId: advances[0].id, debit: 40, credit: 0 },
      { accountId: fx.accounts.bank1.id, debit: 0, credit: 40 },
    ]))
    const after = await gl()
    expect(after.get(advances[0].id)).toBe(45)
    expect(after.get(fx.accounts.payables.id) ?? 0).toBe(apBefore)
  })

  it("an advance to another company's supplier -> 404", async () => {
    const other = await seedZZTest({ label: 'ZZTEST A1 Other', bank1Funds: 0 })
    const r = await payment(fx, { amount: 1, entityType: 'SUPPLIER_ADVANCE', supplierId: other.supplier.id })
    expect(r.status).toBe(404)
  })

  it('a bank account with no GL account -> 400 BANK_NOT_LINKED (every payment gets a journal)', async () => {
    const bank = { id: crypto.randomUUID(), companyId: fx.companyId, account_name: 'Unlinked', chart_account_id: null, currency: 'USD', current_balance: 100, is_active: true }
    await prisma.bankAccount.create({ data: bank })
    const r = await payment(fx, { bankAccountId: bank.id, amount: 5, entityType: 'EXPENSE', expenseAccountId: fx.accounts.officeExpenses.id })
    expect([r.status, r.json.code]).toEqual([400, 'BANK_NOT_LINKED'])
    await prisma.bankAccount.delete({ where: { id: bank.id } })
  })

  it('GL 2000 equals what suppliers are owed', async () => {
    const ap = await getPayables(prisma, fx.companyId)
    expect(ap.difference?.toFixed(2)).toBe('0.00')
    expect(Number(ap.total)).toBe((await gl()).get(fx.accounts.payables.id))
  })
})
