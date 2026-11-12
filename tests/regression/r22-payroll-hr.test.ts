import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import * as payroll from '@/app/api/hr/payroll/route'
import * as employees from '@/app/api/hr/employees/route'
import * as accounts from '@/app/api/finance/accounts/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30' }

async function attendance(guardId: string, statuses: string[]) {
  await prisma.attendance.createMany({
    data: statuses.map((status, i) => ({ id: crypto.randomUUID(), guardId, date: new Date(Date.UTC(2026, 10, i + 1)), status: status as never })),
  })
}

describe('Regression R22: payroll pay basis', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest()
    const [g1, g2, g3] = fx.guards
    await attendance(g1.id, Array(5).fill('PRESENT'))
    await attendance(g2.id, ['PRESENT', 'PRESENT', 'PRESENT', 'LEAVE', 'LEAVE'])
    await attendance(g3.id, ['PRESENT', 'PRESENT', 'ABSENT', 'ABSENT', 'ABSENT'])
    await loginAs(fx.sessionFor(fx.users.admin))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('5 PRESENT days at $6 -> 30; PRESENT + paid LEAVE count; ABSENT is not paid', async () => {
    const r = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=preview', body: period })
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    const gross = Object.fromEntries(r.json.previews.map((p: { guardId: string; grossPay: number }) => [p.guardId, p.grossPay]))
    expect([gross[fx.guards[0].id], gross[fx.guards[1].id], gross[fx.guards[2].id]]).toEqual([30, 30, 12])
  })

  it('a duplicate period -> 409', async () => {
    const first = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { ...period, bankAccountId: fx.banks.b1.id } })
    expect(first.status, JSON.stringify(first.json)).toBe(201)
    const again = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { ...period, bankAccountId: fx.banks.b1.id } })
    expect(again.status).toBe(409)
  })

  it('a zero-gross run -> 400 PAYROLL_INVALID', async () => {
    const empty = await seedZZTest({ label: 'ZZTEST Empty Payroll' })
    await loginAs(empty.sessionFor(empty.users.admin))
    const r = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { ...period, bankAccountId: empty.banks.b1.id } })
    expect([r.status, r.json.code]).toEqual([400, 'PAYROLL_INVALID'])
    await loginAs(fx.sessionFor(fx.users.admin))
  })
})

describe('Regression R23: employee validation', () => {
  let fx: ZZ
  const valid = { name: 'Rudo Chikwanha', idNumber: '63-123456 A 12', dateOfBirth: '1990-04-02', dateHired: '2020-01-15', dailyRate: 6 }
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.hr))
    const r = await callRoute(employees.POST, { method: 'POST', path: '/api/hr/employees', body: valid })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
  })
  const create = (patch: Record<string, unknown>) => callRoute(employees.POST, { method: 'POST', path: '/api/hr/employees', body: { ...valid, idNumber: crypto.randomUUID(), ...patch } })

  it('a duplicate national ID -> 400 or 409', async () => {
    const r = await create({ name: 'Someone Else', idNumber: '63123456A12' })
    expect([400, 409]).toContain(r.status)
  })

  it.each([
    ['younger than 18', { dateOfBirth: new Date(Date.now() - 17 * 365.25 * 86400000).toISOString().slice(0, 10), dateHired: null }],
    ['older than 75', { dateOfBirth: '1940-01-01' }],
    ['an invalid date', { dateOfBirth: '1990-02-31' }],
    ['a daily rate of 0', { dailyRate: 0 }],
    ['a negative daily rate', { dailyRate: -1 }],
    ['a name over 120 characters', { name: 'x'.repeat(121) }],
    ['hired before birth', { dateOfBirth: '1990-01-01', dateHired: '1989-12-31' }],
  ])('%s -> 400', async (_name, patch) => {
    const r = await create(patch)
    expect(r.status, JSON.stringify(r.json)).toBe(400)
  })
})

describe('Regression R24: chart of accounts', () => {
  let fx: ZZ
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  const create = (body: Record<string, unknown>) => callRoute(accounts.POST, { method: 'POST', path: '/api/finance/accounts', body })

  it('a duplicate account code -> 400', async () => {
    expect((await create({ accountCode: '1100', name: 'Another AR', type: 'ASSET' })).status).toBe(400)
  })

  it('a code outside its type range -> 400 ACCOUNT_CODE_RANGE', async () => {
    const r = await create({ accountCode: '4000', name: 'Bank Loan', type: 'LIABILITY' })
    expect([r.status, r.json.code]).toEqual([400, 'ACCOUNT_CODE_RANGE'])
  })
})
