import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { ledgerBalances, ledgerBalanceSheet } from '@/lib/reports/ledger'
import { reconcileCompany } from '@/lib/reconcile'
import * as assets from '@/app/api/finance/fixed-assets/route'
import * as asset from '@/app/api/finance/fixed-assets/[id]/route'
import * as inventory from '@/app/api/finance/inventory/route'
import * as cron from '@/app/api/cron/depreciation/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('P1-11 fixed assets and inventory post to the GL', () => {
  let fx: Fixture
  const acct = { fa: crypto.randomUUID(), acc: crypto.randomUUID(), dep: crypto.randomUUID(), inv: crypto.randomUUID() }
  const balance = async (id: string) => Number((await ledgerBalances(prisma, fx.companyId, { to: new Date('2099-01-01') })).find((r) => r.id === id)?.balance ?? 0)

  beforeAll(async () => {
    fx = await seedCompany('Assets Co')
    const mk = (id: string, code: string, name: string, type: string) => ({ id, companyId: fx.companyId, account_code: code, account_name: name, account_type: type, is_active: true })
    await prisma.chartOfAccount.createMany({ data: [mk(acct.fa, '1500', 'Fixed Assets', 'ASSET'), mk(acct.acc, '1590', 'Accumulated Depreciation', 'ASSET'), mk(acct.dep, '5600', 'Depreciation', 'EXPENSE'), mk(acct.inv, '1400', 'Inventory', 'ASSET')] })
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('refuses to register an asset until the Fixed Assets account is set', async () => {
    const r = await callRoute(assets.POST, { method: 'POST', path: '/api/finance/fixed-assets', body: { name: 'Radio set', category: 'Equipment', purchaseDate: '2026-10-15', purchasePrice: 1200, usefulLifeYears: 1 } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('ACCOUNT_NOT_CONFIGURED')
  })

  let assetId: string
  it('an asset paid from the bank posts Dr Fixed Assets / Cr bank', async () => {
    await prisma.company.update({ where: { id: fx.companyId }, data: { fixedAssetsAccountId: acct.fa, accumulatedDepreciationAccountId: acct.acc, depreciationExpenseAccountId: acct.dep, inventoryAccountId: acct.inv } })
    const r = await callRoute(assets.POST, { method: 'POST', path: '/api/finance/fixed-assets', body: { name: 'Radio set', category: 'Equipment', purchaseDate: '2026-10-15', purchasePrice: 1200, usefulLifeYears: 1, paidFromBankAccountId: fx.bankAccount.id } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    assetId = r.json.asset.id
    expect(await balance(acct.fa)).toBe(1200)
    expect(await balance(fx.accounts.bank.id)).toBe(-1200)
    expect(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: fx.bankAccount.id } })).current_balance)).toBe(-1200)
  })

  it('depreciation posts once per month and the register matches the GL', async () => {
    const dep = () => callRoute(asset.POST, { method: 'POST', path: `/api/finance/fixed-assets/${assetId}?action=depreciate&period=2026-11`, params: { id: assetId } })
    const first = await dep()
    expect(first.status, JSON.stringify(first.json)).toBe(200)
    expect(first.json.monthlyDep).toBe(100)
    expect((await dep()).status).toBe(409)
    expect(await balance(acct.dep)).toBe(100)
    // Accumulated depreciation is a contra-asset: a credit balance.
    expect(await balance(acct.acc)).toBe(-100)

    process.env.CRON_SECRET = 'test-cron-secret'
    const run = await callRoute(cron.GET, { path: '/api/cron/depreciation?period=2026-12', headers: { authorization: 'Bearer test-cron-secret' } })
    expect(run.status).toBe(200)
    const register = await prisma.fixedAsset.findUniqueOrThrow({ where: { id: assetId } })
    expect(Number(register.accumulatedDepreciation)).toBe(200)
    expect(Number(register.currentValue)).toBe(1000)
    expect((await balance(acct.fa)) + (await balance(acct.acc))).toBe(Number(register.currentValue))
  })

  it('valued stock posts Dr Inventory / Cr Opening Balance Equity', async () => {
    const r = await callRoute(inventory.POST, { method: 'POST', path: '/api/finance/inventory', body: { name: 'Uniforms', category: 'Kit', unit: 'pcs', quantityOnHand: 40, reorderLevel: 10, unitCost: 12.5 } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    expect(await balance(acct.inv)).toBe(500)
  })

  it('the books still balance and reconcile', async () => {
    expect((await ledgerBalanceSheet(prisma, fx.companyId, new Date('2099-01-01'))).balanced).toBe(true)
    const rec = await reconcileCompany(prisma, fx.companyId)
    expect(rec.differences, JSON.stringify(rec.differences)).toEqual([])
  })
})
