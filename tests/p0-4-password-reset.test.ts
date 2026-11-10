import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sealData } from 'iron-session'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/auth'
import { sessionOptions, isSessionRevoked, SESSION_RECHECK_MS } from '@/lib/session'
import { RESET_TOKEN_PREFIX } from '@/lib/password-reset'
import { POST as forgot } from '@/app/api/auth/forgot-password/route'
import { POST as reset } from '@/app/api/auth/reset-password/route'
import { GET as sessionStatus } from '@/app/api/auth/session-status/route'
import { middleware } from '@/middleware'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

const sent: { to: string; text?: string }[] = []
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (m: { to: string; text?: string }) => { sent.push(m); return { success: true } }),
}))

let ipSeq = 0
const freshIp = () => ({ 'x-forwarded-for': `10.0.0.${++ipSeq}` })

async function requestLink(email: string) {
  sent.length = 0
  const r = await callRoute(forgot, { method: 'POST', path: '/api/auth/forgot-password', body: { email }, headers: freshIp() })
  const token = sent[0]?.text?.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1]
  return { ...r, token }
}

describe('P0-4 forgot / reset password', () => {
  let fx: Fixture
  const email = () => fx.users.hr.email
  beforeAll(async () => { fx = await seedCompany('Reset Co') })
  beforeEach(async () => { await prisma.otpToken.deleteMany({}) })

  it('answers identically for known and unknown accounts', async () => {
    const known = await requestLink(email())
    const unknown = await requestLink('nobody@nowhere.test')
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(unknown.json).toEqual(known.json)
    expect(unknown.token).toBeUndefined()
    expect(known.token).toBeDefined()
  })

  it('stores only the SHA-256 of the token, expiring in 30 minutes', async () => {
    const { token } = await requestLink(email())
    const row = await prisma.otpToken.findFirstOrThrow({ where: { email: email(), token: { startsWith: RESET_TOKEN_PREFIX } } })
    expect(row.token).toMatch(/^reset:[0-9a-f]{64}$/)
    expect(row.token).not.toContain(token!)
    const minutes = (row.expiresAt.getTime() - Date.now()) / 60000
    expect(minutes).toBeGreaterThan(29)
    expect(minutes).toBeLessThanOrEqual(30)
  })

  it('resets the password, revokes sessions, audits, and the link works only once', async () => {
    const { token } = await requestLink(email())
    const ok = await callRoute(reset, { method: 'POST', path: '/api/auth/reset-password', body: { token, newPassword: 'New-secure-pass-9' } })
    expect(ok.status, JSON.stringify(ok.json)).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { id: fx.users.hr.id } })
    expect(await verifyPassword('New-secure-pass-9', user.password)).toBe(true)
    expect(user.passwordChangedAt).toBeInstanceOf(Date)
    const audit = await prisma.auditTrail.findFirst({ where: { userId: user.id, module: 'Auth' }, orderBy: { createdAt: 'desc' } })
    expect(audit?.newValues).toContain('PASSWORD_RESET')

    const again = await callRoute(reset, { method: 'POST', path: '/api/auth/reset-password', body: { token, newPassword: 'Another-pass-10' } })
    expect(again.status).toBe(400)
    expect(again.json.code).toBe('INVALID_TOKEN')
  })

  it('rejects an expired token', async () => {
    const { token } = await requestLink(email())
    await prisma.otpToken.updateMany({ where: { email: email() }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const r = await callRoute(reset, { method: 'POST', path: '/api/auth/reset-password', body: { token, newPassword: 'New-secure-pass-9' } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('INVALID_TOKEN')
  })

  it('an older link stops working once a newer one is requested', async () => {
    const first = await requestLink(email())
    await requestLink(email())
    const r = await callRoute(reset, { method: 'POST', path: '/api/auth/reset-password', body: { token: first.token, newPassword: 'New-secure-pass-9' } })
    expect(r.status).toBe(400)
  })

  it.each(['short1A', 'onlyletterslong', '1234567890123'])('rejects weak password %j', async (pw) => {
    const { token } = await requestLink(email())
    const r = await callRoute(reset, { method: 'POST', path: '/api/auth/reset-password', body: { token, newPassword: pw } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('WEAK_PASSWORD')
  })

  it('rate-limits per IP (429) and per email (silently: no new link)', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.7' }
    const statuses = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await callRoute(forgot, { method: 'POST', path: '/api/auth/forgot-password', body: { email: `x${i}@nowhere.test` }, headers: ip })).status)
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)

    await prisma.otpToken.deleteMany({})
    for (let i = 0; i < 3; i++) expect((await requestLink(email())).token).toBeDefined()
    const fourth = await requestLink(email())
    expect(fourth.status).toBe(200)
    expect(fourth.token).toBeUndefined()
  })
})

describe('P0-4 session revocation', () => {
  let fx: Fixture
  beforeAll(async () => { fx = await seedCompany('Revoke Co') })

  it('isSessionRevoked', () => {
    const t = new Date('2026-11-10T10:00:00Z')
    expect(isSessionRevoked({ issuedAt: t.getTime() - 1 }, { active: true, passwordChangedAt: t })).toBe(true)
    expect(isSessionRevoked({ issuedAt: t.getTime() + 1 }, { active: true, passwordChangedAt: t })).toBe(false)
    expect(isSessionRevoked({}, { active: true, passwordChangedAt: null })).toBe(false)
    expect(isSessionRevoked({ issuedAt: Date.now() }, { active: false, passwordChangedAt: null })).toBe(true)
    expect(isSessionRevoked({ issuedAt: Date.now() }, null)).toBe(true)
  })

  it('session-status reports a pre-reset session as invalid', async () => {
    const s = fx.sessionFor(fx.users.ops)
    await loginAs({ ...s, issuedAt: Date.now() - 60_000 })
    expect((await callRoute(sessionStatus, { path: '/api/auth/session-status' })).json.valid).toBe(true)
    await prisma.user.update({ where: { id: fx.users.ops.id }, data: { passwordChangedAt: new Date() } })
    expect((await callRoute(sessionStatus, { path: '/api/auth/session-status' })).json.valid).toBe(false)
  })

  it('middleware signs out a revoked session on its next recheck', async () => {
    const sealed = await sealData(
      { ...fx.sessionFor(fx.users.finance), isLoggedIn: true, issuedAt: Date.now() - 60_000, checkedAt: Date.now() - SESSION_RECHECK_MS - 1 },
      { password: sessionOptions.password as string },
    )
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ valid: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const req = new NextRequest('http://localhost:3000/api/finance/journal-entries', { headers: { cookie: `${sessionOptions.cookieName}=${sealed}` } })
    const res = await middleware(req)
    vi.unstubAllGlobals()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'SESSION_REVOKED' })
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`${sessionOptions.cookieName}=;`))
  })

  it('middleware does not re-check a recently checked session', async () => {
    const sealed = await sealData(
      { ...fx.sessionFor(fx.users.finance), isLoggedIn: true, issuedAt: Date.now(), checkedAt: Date.now() },
      { password: sessionOptions.password as string },
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await middleware(new NextRequest('http://localhost:3000/api/finance/journal-entries', { headers: { cookie: `${sessionOptions.cookieName}=${sealed}` } }))
    vi.unstubAllGlobals()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('middleware no longer skips role guards for dotted API paths', async () => {
    const sealed = await sealData(
      { ...fx.sessionFor(fx.users.ops), role: 'GUARD', isLoggedIn: true, issuedAt: Date.now(), checkedAt: Date.now() },
      { password: sessionOptions.password as string },
    )
    const res = await middleware(new NextRequest('http://localhost:3000/api/hr/employees/abc.def', { headers: { cookie: `${sessionOptions.cookieName}=${sealed}` } }))
    expect(res.status).toBe(403)
  })
})
