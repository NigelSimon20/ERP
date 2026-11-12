import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import nextConfig from '@/next.config.mjs'
import { apiError } from '@/lib/api-error'
import * as login from '@/app/api/auth/login/route'
import * as forgot from '@/app/api/auth/forgot-password/route'
import * as journals from '@/app/api/finance/journal-entries/route'
import * as journal from '@/app/api/finance/journal-entries/[id]/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import * as salesInvoice from '@/app/api/finance/sales-invoices/[id]/route'
import * as receipts from '@/app/api/finance/receipts/route'
import * as financeDashboard from '@/app/api/dashboard/finance/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { invoice, receipt, postedJournal } from './actions'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Regression R27: security', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    // Prisma loads .env into process.env; never let a test reach the real
    // Supabase Auth through the login route's fallback.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('an unauthenticated API call -> 401', async () => {
    await loginAs(null)
    for (const handler of [journals.GET, salesInvoices.GET, receipts.GET, financeDashboard.GET]) {
      expect((await callRoute(handler, { path: '/api/x' })).status).toBe(401)
    }
  })

  it('authenticated APIs send Cache-Control: private, no-store; the hardening headers are set; no x-powered-by', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    const rules = await nextConfig.headers!()
    const all = Object.fromEntries(rules.find((r) => r.source === '/:path*')!.headers.map((h) => [h.key, h.value]))
    expect(all['Content-Security-Policy'] ?? all['Content-Security-Policy-Report-Only']).toBeTruthy()
    expect(all['X-Frame-Options']).toBe('DENY')
    expect(all['X-Content-Type-Options']).toBe('nosniff')
    expect(all['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(all['Permissions-Policy']).toBeTruthy()
    expect(rules.find((r) => r.source === '/api/:path*')!.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store' })
    expect(apiError(new Error('x')).headers.get('cache-control')).toBe('private, no-store')
  })

  it('forgot-password gives the same response for a real and an unknown email', async () => {
    await loginAs(null)
    const real = await callRoute(forgot.POST, { method: 'POST', path: '/api/auth/forgot-password', body: { email: fx.users.hr.email }, headers: { 'x-forwarded-for': '10.9.0.1' } })
    const fake = await callRoute(forgot.POST, { method: 'POST', path: '/api/auth/forgot-password', body: { email: 'nobody@zztest.local' }, headers: { 'x-forwarded-for': '10.9.0.2' } })
    expect(real.status).toBe(fake.status)
    expect(real.json).toEqual(fake.json)
  })

  it('login is rate limited: 429 after 5 failures', async () => {
    await loginAs(null)
    const attempt = () => callRoute(login.POST, { method: 'POST', path: '/api/auth/login', body: { email: fx.users.ops.email, password: 'wrong-password-1' } })
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(429)
  })
})

describe('Regression R29: tenant isolation', () => {
  let x: ZZ
  let y: ZZ
  const ids = {} as { invoice: string; journal: string }
  beforeAll(async () => {
    x = await seedZZTest({ label: 'ZZTEST X', bank1Funds: 0 })
    y = await seedZZTest({ label: 'ZZTEST Y', bank1Funds: 0 })
    await loginAs(y.sessionFor(y.users.finance))
    ids.invoice = (await invoice(y, 80)).id
    ids.journal = await postedJournal([{ accountId: y.accounts.prepaid.id, debit: 2 }, { accountId: y.accounts.revenue.id, credit: 2 }])
    await loginAs(x.sessionFor(x.users.finance))
  })
  afterAll(async () => {
    await assertLedgerInvariants(x)
    await assertLedgerInvariants(y)
  })

  it("Company X cannot GET, void or receipt against Company Y's records -> 404", async () => {
    expect((await callRoute(salesInvoice.GET, { path: `/api/finance/sales-invoices/${ids.invoice}`, params: { id: ids.invoice } })).status).toBe(404)
    expect((await callRoute(salesInvoice.POST, { method: 'POST', path: `/api/finance/sales-invoices/${ids.invoice}?action=void`, params: { id: ids.invoice } })).status).toBe(404)
    expect((await receipt(x, { invoiceId: ids.invoice, amount: 5 })).status).toBe(404)
    expect((await callRoute(journal.GET, { path: `/api/finance/journal-entries/${ids.journal}`, params: { id: ids.journal } })).status).toBe(404)
    expect((await callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${ids.journal}?action=void`, params: { id: ids.journal } })).status).toBe(404)
  })
})
