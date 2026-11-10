import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { prisma } from '@/lib/prisma'
import { reconcileCompany } from '@/lib/reconcile'
import { ledgerBalanceSheet } from '@/lib/reports/ledger'
import * as bankAccounts from '@/app/api/finance/bank-accounts/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as receipts from '@/app/api/finance/receipts/route'
import * as cron from '@/app/api/cron/reconcile/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})
const runScript = (name: string, ...args: string[]) =>
  execFileSync('node', [`scripts/remediate/${name}`, ...args], { env: { ...process.env, DIRECT_URL: process.env.TEST_DATABASE_URL }, encoding: 'utf8' })

describe('P1-3 opening balances and reconciliation', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Reconcile Co')
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('a new bank account posts its opening balance as a balanced journal against 3050 (BUG-005)', async () => {
    const r = await callRoute(bankAccounts.POST, { method: 'POST', path: '/api/finance/bank-accounts', body: { bankName: 'Ecobank', accountNumber: '0011', accountType: 'CURRENT', currency: 'USD', openingBalance: 53609 } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    const coaId = r.json.account.chart_account_id
    const je = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fx.companyId, source_type: 'openingBalance', source_id: coaId } })
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: je.id } })
    const equity = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fx.companyId, account_code: '3050' } })
    expect(lines.find((l) => l.accountId === coaId)?.debit.toFixed(2)).toBe('53609.00')
    expect(lines.find((l) => l.accountId === equity.id)?.credit.toFixed(2)).toBe('53609.00')
    expect((await ledgerBalanceSheet(prisma, fx.companyId, new Date())).balanced).toBe(true)
  })

  it('the reconcile job is clean after normal activity', async () => {
    const inv = await callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', body: {
      customerId: fx.customer.id, issueDate: '2026-11-01', dueDate: '2026-11-30', revenueAccountId: fx.accounts.revenue.id,
      lineItems: [{ description: 'Guarding', quantity: 3, unitPrice: 33.33, taxRate: 0 }],
    } })
    expect((await callRoute(receipts.POST, { method: 'POST', path: '/api/finance/receipts', body: { bankAccountId: fx.bankAccount.id, invoiceId: inv.json.invoice.id, amount: 50, receiptDate: '2026-11-05' } })).status).toBe(201)
    const r = await reconcileCompany(prisma, fx.companyId)
    expect(r.differences).toEqual([])
    expect(r.clean).toBe(true)
  })

  it('detects a stored balance that drifted from the ledger, and notifies finance admins', async () => {
    await prisma.bankAccount.update({ where: { id: fx.bankAccount.id }, data: { current_balance: { increment: 20869.38 } } })
    const r = await reconcileCompany(prisma, fx.companyId)
    expect(r.differences).toContainEqual(expect.objectContaining({ kind: 'BANK_ACCOUNT', id: fx.bankAccount.id, difference: 20869.38 }))

    process.env.CRON_SECRET = 'test-cron-secret'
    const res = await callRoute(cron.GET, { path: '/api/cron/reconcile', headers: { authorization: 'Bearer test-cron-secret' } })
    expect(res.status).toBe(200)
    expect(await prisma.notification.count({ where: { companyId: fx.companyId, type: 'RECONCILE' } })).toBeGreaterThan(0)
    expect((await callRoute(cron.GET, { path: '/api/cron/reconcile' })).status).toBe(401)
  })

  it('recompute-balances --dry-run reports before/after and writes nothing', async () => {
    const out = runScript('recompute-balances.mjs', '--dry-run')
    expect(out).toContain('CBZ USD')
    expect(out).toContain('Dry run: nothing was written.')
    expect(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: fx.bankAccount.id } })).current_balance)).toBeGreaterThan(20000)
  })

  it('opening-balances --dry-run lists accounts whose opening balance never reached the ledger', async () => {
    const legacy = { id: crypto.randomUUID(), companyId: fx.companyId, account_code: '1019', account_name: 'Bank ZWG (legacy)', account_type: 'ASSET', is_active: true, opening_balance: 556666, current_balance: 556666, currency: 'USD' }
    await prisma.chartOfAccount.create({ data: legacy })
    const out = runScript('opening-balances.mjs', '--dry-run')
    expect(out).toMatch(/1019 \| Bank ZWG \(legacy\) \| ASSET \| 556666\.00 \| Dr 1019 \/ Cr 3050/)
    expect(await prisma.journalEntry.count({ where: { reference: 'JE-OB-1019' } })).toBe(0)

    runScript('opening-balances.mjs', '--apply')
    expect(await prisma.journalEntry.count({ where: { reference: 'JE-OB-1019' } })).toBe(1)
    expect((await ledgerBalanceSheet(prisma, fx.companyId, new Date())).balanced).toBe(true)
  })
})
