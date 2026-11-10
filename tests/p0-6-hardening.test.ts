import { describe, it, expect, beforeAll, vi } from 'vitest'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { apiError } from '@/lib/api-error'
import nextConfig from '@/next.config.mjs'
import { POST as createJournal } from '@/app/api/finance/journal-entries/route'
import { POST as createCreditNote } from '@/app/api/finance/credit-notes/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

const LEAKY = /prisma|invocation|companyId|findFirst|SELECT|P20\d\d/i

async function body(res: Response) {
  return { status: res.status, json: await res.json(), cache: res.headers.get('cache-control') }
}

describe('P0-6 apiError never leaks internals', () => {
  beforeAll(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('Prisma validation error (e.g. invalid date) -> 400 INVALID_INPUT, no query text', async () => {
    const err = new Prisma.PrismaClientValidationError('Invalid `prisma.lockDate.findFirst()` invocation: { where: { companyId: "abc", lockedUntil: { gte: new Date("Invalid Date") } } }', { clientVersion: '5.22.0' })
    const r = await body(apiError(err))
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('INVALID_INPUT')
    expect(JSON.stringify(r.json)).not.toMatch(LEAKY)
    expect(r.json.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.cache).toBe('private, no-store')
  })

  it.each([
    ['P2002', 409, 'DUPLICATE'],
    ['P2003', 400, 'INVALID_REFERENCE'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2010', 500, 'INTERNAL_ERROR'],
  ])('Prisma %s -> %i %s', async (code, status, apiCode) => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`companyId`,`invoice_number`)', { code, clientVersion: '5.22.0' })
    const r = await body(apiError(err))
    expect(r.status).toBe(status)
    expect(r.json.code).toBe(apiCode)
    expect(JSON.stringify(r.json)).not.toMatch(LEAKY)
  })

  it('Zod -> 400 VALIDATION_ERROR with per-field messages', async () => {
    const err = z.object({ amount: z.number().positive('Amount must be positive') }).safeParse({ amount: -1 }).error!
    const r = await body(apiError(err))
    expect(r.status).toBe(400)
    expect(r.json).toMatchObject({ code: 'VALIDATION_ERROR', error: 'amount: Amount must be positive', fields: { amount: 'Amount must be positive' } })
  })

  it('malformed JSON -> 400 INVALID_JSON', async () => {
    const r = await body(apiError(new SyntaxError('Unexpected token } in JSON at position 7')))
    expect(r).toMatchObject({ status: 400, json: { code: 'INVALID_JSON' } })
  })

  it('programming errors are hidden behind a generic 500', async () => {
    const r = await body(apiError(new TypeError("Cannot read properties of undefined (reading 'companyId')"), 'Failed to save'))
    expect(r.status).toBe(500)
    expect(r.json).toMatchObject({ error: 'Failed to save', code: 'INTERNAL_ERROR' })
  })

  it('a deliberate business error still reaches the user', async () => {
    const r = await body(apiError(new Error('Only DRAFT credit notes can be issued'), 'Failed', 409))
    expect(r).toMatchObject({ status: 409, json: { error: 'Only DRAFT credit notes can be issued', code: 'REQUEST_FAILED' } })
  })

  it('a plain Error carrying database text is still hidden', async () => {
    const r = await body(apiError(new Error('insert or update on table "receipts" violates foreign key constraint "receipts_customerId_fkey"')))
    expect(r.json.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(r.json)).not.toMatch(/constraint|receipts_customerId/)
  })
})

describe('P0-6 routes return { error, code } instead of raw errors', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Hardening Co')
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('journal API with an invalid date (audit repro) no longer echoes the Prisma invocation', async () => {
    const { status, json } = await callRoute(createJournal, {
      method: 'POST', path: '/api/finance/journal-entries',
      body: { entryDate: 'not-a-date', description: 'Bad date', lines: [{ accountId: fx.accounts.bank.id, debit: 5, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: 5 }] },
    })
    expect(status).toBe(400)
    expect(json.code).toBeDefined()
    expect(JSON.stringify(json)).not.toMatch(LEAKY)
    expect(JSON.stringify(json)).not.toContain(fx.companyId)
  })

  it('a malformed JSON body gets a clean 400', async () => {
    const res = await createCreditNote(new (await import('next/server')).NextRequest('http://localhost:3000/api/finance/credit-notes', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: (await import('./helpers/cookies')).cookieHeader() }, body: '{"customerId":',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_JSON')
  })
})

describe('P0-6 security headers', () => {
  it('sets the hardening headers on every path and no-store on /api', async () => {
    expect(nextConfig.poweredByHeader).toBe(false)
    const rules = await nextConfig.headers!()
    const all = Object.fromEntries(rules.find((r) => r.source === '/:path*')!.headers.map((h) => [h.key, h.value]))
    expect(all['X-Frame-Options']).toBe('DENY')
    expect(all['X-Content-Type-Options']).toBe('nosniff')
    expect(all['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(all['Permissions-Policy']).toContain('camera=()')
    expect(all['Content-Security-Policy-Report-Only']).toContain("frame-ancestors 'none'")
    const api = rules.find((r) => r.source === '/api/:path*')!.headers
    expect(api).toContainEqual({ key: 'Cache-Control', value: 'private, no-store' })
  })
})
