import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { parseRbzRates, isRateStale } from '@/lib/fx/rbz'
import { ApiError } from '@/lib/api-error'
import * as exchangeRates from '@/app/api/finance/exchange-rates/route'
import * as cron from '@/app/api/cron/rbz-rates/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})
const page = (name: string) => fs.readFileSync(path.join(__dirname, '../fixtures/rbz', name), 'utf8')

// A5: "Could not find exchange rate date on RBZ page" -> 502. The live page
// now splits the date across <span>s ("EXCHANGE RATES <span>12</span><span>-11-2026</span>").
describe('A5 RBZ parser', () => {
  it('reads the live page (saved 12 Nov 2026)', () => {
    const { effectiveDate, rates } = parseRbzRates(page('live-2026-11-12.html'))
    expect(effectiveDate.toISOString().slice(0, 10)).toBe('2026-11-12')
    expect(rates.map((r) => `${r.base}/${r.target}`)).toEqual(['USD/ZWG', 'GBP/ZWG', 'EUR/ZWG', 'ZWG/ZAR', 'BWP/ZWG'])
    expect(rates[0]).toEqual({ base: 'USD', target: 'ZWG', bid: 25.8762, ask: 27.2032, avg: 26.5397 })
  })

  it('still reads it with the tab ids gone, without picking up the other tabs or the 2018 archive', () => {
    const { rates } = parseRbzRates(page('live-without-tab-ids.html'))
    expect(rates).toHaveLength(5)
  })

  it('reads the layout the old parser was written for, ignoring the archived table', () => {
    const { effectiveDate, rates } = parseRbzRates(page('legacy-layout.html'))
    expect(effectiveDate.toISOString().slice(0, 10)).toBe('2026-10-03')
    expect(rates.map((r) => r.target)).toEqual(['ZWG', 'ZAR'])
  })

  it('reads a reworked layout: <th> cells, "as at" with slashes, thousands separators', () => {
    const { effectiveDate, rates } = parseRbzRates(page('reworked-layout.html'))
    expect(effectiveDate.toISOString().slice(0, 10)).toBe('2026-11-10')
    expect(rates.map((r) => r.avg)).toEqual([26.5, 35.19, 1028])
  })

  it('a page with no rates -> RBZ_PARSE_FAILED (a 4xx, not a 502)', () => {
    let err: unknown
    try { parseRbzRates(page('maintenance.html')) } catch (e) { err = e }
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 422, code: 'RBZ_PARSE_FAILED' })
  })

  it('a rate older than 3 days is stale', () => {
    const now = new Date('2026-11-12T12:00:00Z')
    expect(isRateStale(new Date('2026-11-10'), now)).toBe(false)
    expect(isRateStale(new Date('2026-11-08'), now)).toBe(true)
    expect(isRateStale(null, now)).toBe(true)
  })
})

describe('A5 sync, cron and staleness', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterEach(() => { vi.unstubAllGlobals() })
  const stubFetch = (html: string, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status })))

  it('sync-rbz stores the parsed rates', async () => {
    stubFetch(page('live-2026-11-12.html'))
    const r = await callRoute(exchangeRates.POST, { method: 'POST', path: '/api/finance/exchange-rates?action=sync-rbz' })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    expect(r.json.count).toBe(5)
    const stored = await prisma.exchangeRate.findFirstOrThrow({ where: { baseCurrency: 'USD', targetCurrency: 'ZWG', effectiveDate: new Date('2026-11-12') } })
    expect(Number(stored.rate)).toBe(26.5397)
  })

  it('a changed page -> 422 RBZ_PARSE_FAILED; an unreachable site -> 503 RBZ_UNAVAILABLE; manual entry still works', async () => {
    stubFetch(page('maintenance.html'))
    const bad = await callRoute(exchangeRates.POST, { method: 'POST', path: '/api/finance/exchange-rates?action=sync-rbz' })
    expect([bad.status, bad.json.code]).toEqual([422, 'RBZ_PARSE_FAILED'])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const down = await callRoute(exchangeRates.POST, { method: 'POST', path: '/api/finance/exchange-rates?action=sync-rbz' })
    expect([down.status, down.json.code]).toEqual([503, 'RBZ_UNAVAILABLE'])
    vi.unstubAllGlobals()
    const manual = await callRoute(exchangeRates.POST, { method: 'POST', path: '/api/finance/exchange-rates', body: { baseCurrency: 'USD', targetCurrency: 'ZAR', rate: 18.4, effectiveDate: '2026-11-12' } })
    expect(manual.status, JSON.stringify(manual.json)).toBe(201)
  })

  it('a failed cron run notifies finance admins once a day', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    stubFetch(page('maintenance.html'))
    const call = () => callRoute(cron.GET, { path: '/api/cron/rbz-rates', headers: { authorization: 'Bearer test-cron-secret' } })
    expect((await call()).status).toBe(422)
    expect((await call()).status).toBe(422)
    const notes = await prisma.notification.findMany({ where: { companyId: fx.companyId, type: 'RBZ_SYNC_FAILED' } })
    expect(notes.map((n) => n.userId).sort()).toEqual([fx.users.admin.id, fx.users.finance.id, fx.users.finance2.id].sort())
  })

  it('the Exchange Rates API and the finance dashboard flag a rate older than 3 days', async () => {
    const list = await callRoute(exchangeRates.GET, { path: '/api/finance/exchange-rates' })
    expect(list.json).toHaveProperty('latestEffectiveDate')
    expect(list.json.stale).toBe(isRateStale(list.json.latestEffectiveDate ? new Date(list.json.latestEffectiveDate) : null))
    const { GET } = await import('@/app/api/dashboard/finance/route')
    const dash = await callRoute(GET, { path: '/api/dashboard/finance' })
    expect(dash.json).toHaveProperty('exchangeRateStale')
  })
})
