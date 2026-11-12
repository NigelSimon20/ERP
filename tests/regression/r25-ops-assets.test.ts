import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ledgerBalances } from '@/lib/reports/ledger'
import * as deployments from '@/app/api/operations/deployments/route'
import * as incidents from '@/app/api/operations/incidents/route'
import * as sites from '@/app/api/operations/sites/route'
import * as overtime from '@/app/api/hr/overtime/route'
import * as guards from '@/app/api/guards/route'
import * as inventory from '@/app/api/finance/inventory/route'
import * as fixedAssets from '@/app/api/finance/fixed-assets/route'
import * as fixedAsset from '@/app/api/finance/fixed-assets/[id]/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Regression R25: operations', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.admin))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  const deploy = (siteId: string) => callRoute(deployments.POST, { method: 'POST', path: '/api/operations/deployments', body: {
    guardId: fx.guards[0].id, siteId, shiftType: 'DAY', startDate: '2026-11-10', endDate: '2026-11-11', hoursPerDay: 12, ratePerHour: 1,
  } })

  it('a guard double-booked on the same date -> 400', async () => {
    const first = await deploy(fx.sites.s1.id)
    expect(first.status, JSON.stringify(first.json)).toBe(201)
    expect((await deploy(fx.sites.s2.id)).status).toBe(400)
  })

  it('an incident severity outside the enum -> 400', async () => {
    const r = await callRoute(incidents.POST, { method: 'POST', path: '/api/operations/incidents', body: { title: 'Gate', description: 'Gate left open overnight', siteId: fx.sites.s1.id, severity: 'APOCALYPTIC' } })
    expect(r.status).toBe(400)
  })

  it('overtime above 24h -> 400', async () => {
    const r = await callRoute(overtime.POST, { method: 'POST', path: '/api/hr/overtime', body: { guardId: fx.guards[1].id, date: '2026-11-12', hoursRequested: 25 } })
    expect(r.status).toBe(400)
  })

  it('/api/guards returns the active guards, and the incident form endpoints load', async () => {
    const g = await callRoute(guards.GET, { path: '/api/guards' })
    expect(g.status).toBe(200)
    expect(g.json.guards.map((x: { id: string }) => x.id).sort()).toEqual(fx.guards.map((x) => x.id).sort())
    const s = await callRoute(sites.GET, { path: '/api/operations/sites' })
    expect(s.status).toBe(200)
    expect(JSON.stringify(s.json)).toContain(fx.sites.s1.id)
  })
})

describe('Regression R26: inventory and assets', () => {
  let fx: ZZ
  const gl = async (id: string) => Number((await ledgerBalances(prisma, fx.companyId, {})).find((a) => a.id === id)?.balance ?? 0)
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('qty 10 with reorder level 5 is not "low"; the stock posts Dr 1200 / Cr 3050', async () => {
    const c = await callRoute(inventory.POST, { method: 'POST', path: '/api/finance/inventory', body: { name: 'Radios', category: 'Comms', unit: 'pcs', quantityOnHand: 10, reorderLevel: 5, unitCost: 20 } })
    expect(c.status, JSON.stringify(c.json)).toBe(201)
    const list = await callRoute(inventory.GET, { path: '/api/finance/inventory' })
    const item = list.json.items.find((i: { itemName?: string; name?: string }) => (i.itemName ?? i.name) === 'Radios')
    expect(item.lowStock).toBe(false)
    expect(await gl(fx.accounts.inventory.id)).toBe(200)
    expect(await gl(fx.accounts.openingBalanceEquity.id)).toBe(200)
  })

  it('an existing asset posts Dr 1500 / Cr 3050; a second depreciation in the same month -> 409', async () => {
    const c = await callRoute(fixedAssets.POST, { method: 'POST', path: '/api/finance/fixed-assets', body: { name: 'Patrol bike', category: 'Vehicles', purchaseDate: '2026-10-01', purchasePrice: 1200, usefulLifeYears: 1 } })
    expect(c.status, JSON.stringify(c.json)).toBe(201)
    expect(await gl(fx.accounts.fixedAssets.id)).toBe(1200)
    expect(await gl(fx.accounts.openingBalanceEquity.id)).toBe(1400)
    const id = c.json.asset.id
    const dep = () => callRoute(fixedAsset.POST, { method: 'POST', path: `/api/finance/fixed-assets/${id}?action=depreciate&period=2026-11`, params: { id } })
    expect((await dep()).status).toBe(200)
    expect((await dep()).status).toBe(409)
  })
})
