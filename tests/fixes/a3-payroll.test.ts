import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { ledgerBalances } from '@/lib/reports/ledger'
import * as payroll from '@/app/api/hr/payroll/route'
import * as run from '@/app/api/hr/payroll/[id]/route'
import * as tables from '@/app/api/hr/statutory-tables/route'
import * as table from '@/app/api/hr/statutory-tables/[id]/route'
import * as lockDates from '@/app/api/finance/lock-dates/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { assertLedgerInvariants } from '../regression/invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

// Fictional test rates -- NOT real ZIMRA/NSSA schedules. The expected
// payslips in tests/fixtures/payroll-expected.csv were worked by hand:
// NSSA 4.5% of gross (ceiling 700); PAYE on gross - NSSA using the bands
// below (rate% x taxable - deduct); AIDS Levy 3% of PAYE; ZIMDEF 1% of gross
// (employer). Each figure is rounded to cents before the next uses it.
const PAYE = { bands: [{ upTo: 100, rate: 0, deduct: 0 }, { upTo: 300, rate: 20, deduct: 20 }, { upTo: 1000, rate: 25, deduct: 35 }, { upTo: null, rate: 30, deduct: 85 }] }
const NSSA = { employeeRate: 4.5, employerRate: 4.5, insurableCeiling: 700 }

const expected = fs.readFileSync(path.join(__dirname, '../fixtures/payroll-expected.csv'), 'utf8').trim().split('\n').slice(1).map((row) => {
  const [guard, paidDays, , gross, nssa, paye, aids, deductions, net, nssaEr, zimdef] = row.split(',')
  return { guard, paidDays: Number(paidDays), gross: Number(gross), nssa: Number(nssa), paye: Number(paye), aids: Number(aids), deductions: Number(deductions), net: Number(net), nssaEr: Number(nssaEr), zimdef: Number(zimdef) }
})

async function attendance(guardId: string, statuses: string[], month = 10) {
  await prisma.attendance.createMany({ data: statuses.map((status, i) => ({ id: crypto.randomUUID(), guardId, date: new Date(Date.UTC(2026, month, i + 1)), status: status as never })) })
}

async function approvedTables(fx: ZZ) {
  await loginAs(fx.sessionFor(fx.users.hr))
  const ids: string[] = []
  for (const [kind, config] of [['PAYE', PAYE], ['NSSA', NSSA], ['AIDS_LEVY', { rateOfPaye: 3 }], ['ZIMDEF', { employerRate: 1 }]] as const) {
    const r = await callRoute(tables.POST, { method: 'POST', path: '/api/hr/statutory-tables', body: { kind, effectiveFrom: '2026-01-01', sourceDocument: 'Test fixture (not a real schedule)', config } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    ids.push(r.json.table.id)
  }
  await loginAs(fx.sessionFor(fx.users.admin))
  for (const id of ids) expect((await callRoute(table.PUT, { method: 'PUT', path: `/api/hr/statutory-tables/${id}?action=approve`, params: { id } })).status).toBe(200)
}

const nov = { periodStart: '2026-11-01', periodEnd: '2026-11-30' }
const confirm = (fx: ZZ, period = nov) => callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { ...period, bankAccountId: fx.banks.b1.id } })
const act = (id: string, action: string, body?: unknown) => callRoute(run.POST, { method: 'POST', path: `/api/hr/payroll/${id}?action=${action}`, params: { id }, body })

describe('A3 payroll: DRAFT -> APPROVED -> PAID', () => {
  let fx: ZZ
  let runId: string
  const gl = async (id: string) => Number((await ledgerBalances(prisma, fx.companyId, {})).find((a) => a.id === id)?.balance ?? 0)
  const bank = async () => Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: fx.banks.b1.id } })).current_balance)

  beforeAll(async () => {
    fx = await seedZZTest()
    const [g1, g2, g3] = fx.guards
    await attendance(g1.id, Array(26).fill('PRESENT'))
    await attendance(g2.id, [...Array(20).fill('PRESENT'), 'LEAVE', 'LEAVE', 'INDUCTION_PAID', 'ABSENT', 'ABSENT', 'ABSENT', 'OFF', 'OFF', 'OFF', 'OFF'])
    await attendance(g3.id, [...Array(10).fill('PRESENT'), ...Array(5).fill('ABSENT')])
    await approvedTables(fx)
    await loginAs(fx.sessionFor(fx.users.hr))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  it('preview matches the hand calculation in payroll-expected.csv', async () => {
    const r = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=preview', body: nov })
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    for (const e of expected) {
      const p = r.json.previews.find((x: { guardName: string }) => x.guardName === e.guard)
      const ded = (name: string) => p.deductionLines.find((l: { name: string }) => l.name === name)?.amount ?? 0
      const emp = (name: string) => p.employerContributions.find((l: { name: string }) => l.name === name)?.amount ?? 0
      expect({ guard: e.guard, paidDays: p.paidDays, gross: p.grossPay, nssa: ded('NSSA (employee)'), paye: ded('PAYE'), aids: ded('AIDS Levy'), deductions: p.totalDeductions, net: p.netPay, nssaEr: emp('NSSA (employer)'), zimdef: emp('ZIMDEF') }).toEqual(e)
    }
  })

  it('confirm creates a DRAFT run: no journal, no money moves', async () => {
    const before = await bank()
    const r = await confirm(fx)
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    runId = r.json.runId
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('DRAFT')
    expect(await prisma.journalEntry.count({ where: { companyId: fx.companyId, source_id: runId } })).toBe(0)
    expect(await bank()).toBe(before)
  })

  it('paying an unapproved run -> 409', async () => {
    const r = await act(runId, 'pay')
    expect([r.status, r.json.code]).toEqual([409, 'PAYROLL_NOT_APPROVED'])
  })

  it('the creator cannot approve their own run -> 403', async () => {
    const r = await act(runId, 'approve')
    expect([r.status, r.json.code]).toEqual([403, 'SECOND_APPROVER_REQUIRED'])
  })

  it('a second user approves: Dr Salaries / Cr payroll liabilities / Cr Net Pay Payable', async () => {
    await loginAs(fx.sessionFor(fx.users.admin))
    const r = await act(runId, 'approve')
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    const stored = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })
    expect(stored).toMatchObject({ status: 'APPROVED', approvedBy: fx.users.admin.id })
    const gross = 354, deductions = 32.57, net = 321.43, employer = 19.47
    expect([Number(stored.totalGross), Number(stored.totalDeductions), Number(stored.totalNet)]).toEqual([gross, deductions, net])
    expect(await gl(fx.accounts.guardSalaries.id)).toBe(gross + employer)
    expect(await gl(fx.accounts.payrollLiabilities.id)).toBe(Math.round((deductions + employer) * 100) / 100)
    const npp = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fx.companyId, account_code: '2210' } })
    expect(await gl(npp.id)).toBe(net)
  })

  it('payslips carry every deduction line and net = gross - deductions', async () => {
    const slips = await prisma.payslip.findMany({ where: { payroll_run_id: runId } })
    expect(slips).toHaveLength(3)
    for (const s of slips) {
      expect(Number(s.net_pay)).toBe(Math.round((Number(s.total_earnings) - Number(s.total_deductions)) * 100) / 100)
      const lines = await prisma.payslipLine.findMany({ where: { payslipId: s.id, itemType: 'DEDUCTION' } })
      expect(lines.map((l) => l.itemName).sort()).toEqual(['AIDS Levy', 'NSSA (employee)', 'PAYE'])
    }
  })

  it('pay: Dr Net Pay Payable / Cr bank, with the bank and its GL moving together', async () => {
    const before = await bank()
    const r = await act(runId, 'pay', { bankAccountId: fx.banks.b1.id, paymentDate: '2026-11-30' })
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe('PAID')
    expect(Math.round((before - (await bank())) * 100) / 100).toBe(321.43)
    const npp = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fx.companyId, account_code: '2210' } })
    expect(await gl(npp.id)).toBe(0)
    expect(await gl(fx.accounts.bank1.id)).toBe(await bank())
  })

  it('a PAID run cannot be paid again, reversed or deleted', async () => {
    expect((await act(runId, 'pay')).status).toBe(409)
    expect((await act(runId, 'reverse')).status).toBe(409)
    expect((await callRoute(run.DELETE, { method: 'DELETE', path: `/api/hr/payroll/${runId}`, params: { id: runId } })).status).toBe(409)
  })

  it('a DRAFT run can be deleted; an APPROVED run can be reversed back to DRAFT', async () => {
    await loginAs(fx.sessionFor(fx.users.hr))
    const dec = await confirm(fx, { periodStart: '2026-12-01', periodEnd: '2026-12-31' })
    // December has no attendance: zero gross is refused, so use October.
    expect(dec.json.code).toBe('PAYROLL_INVALID')
    for (const g of fx.guards) await attendance(g.id, ['PRESENT', 'PRESENT'], 9)
    const oct = { periodStart: '2026-10-01', periodEnd: '2026-10-31' }
    const draft = await confirm(fx, oct)
    expect(draft.status, JSON.stringify(draft.json)).toBe(201)
    const del = await callRoute(run.DELETE, { method: 'DELETE', path: `/api/hr/payroll/${draft.json.runId}`, params: { id: draft.json.runId } })
    expect(del.status).toBe(200)
    expect(await prisma.payrollRun.count({ where: { id: draft.json.runId } })).toBe(0)
    expect(await prisma.payslip.count({ where: { payroll_run_id: draft.json.runId } })).toBe(0)

    const again = await confirm(fx, oct)
    await loginAs(fx.sessionFor(fx.users.admin))
    expect((await act(again.json.runId, 'approve')).status).toBe(200)
    const salariesBefore = await gl(fx.accounts.guardSalaries.id)
    const rev = await act(again.json.runId, 'reverse')
    expect(rev.status, JSON.stringify(rev.json)).toBe(200)
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: again.json.runId } })).status).toBe('DRAFT')
    expect(await gl(fx.accounts.guardSalaries.id)).toBeLessThan(salariesBefore)
  })
})

describe('A3 payroll guards', () => {
  it('paying more than the bank holds -> 400 INSUFFICIENT_FUNDS, and the run stays APPROVED', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Poor', bank1Funds: 20 })
    for (const g of fx.guards) await attendance(g.id, Array(5).fill('PRESENT'))
    await loginAs(fx.sessionFor(fx.users.hr))
    const c = await confirm(fx)
    await loginAs(fx.sessionFor(fx.users.admin))
    expect((await act(c.json.runId, 'approve')).status).toBe(200)
    const r = await act(c.json.runId, 'pay', { bankAccountId: fx.banks.b1.id })
    expect([r.status, r.json.code]).toEqual([400, 'INSUFFICIENT_FUNDS'])
    expect((await prisma.payrollRun.findUniqueOrThrow({ where: { id: c.json.runId } })).status).toBe('APPROVED')
    expect(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: fx.banks.b1.id } })).current_balance)).toBe(20)
    await assertLedgerInvariants(fx)
  })

  it('with the second-approver setting off, the creator may approve; a Super Admin may override it, with an audit row', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Settings' })
    for (const g of fx.guards) await attendance(g.id, Array(3).fill('PRESENT'))
    await loginAs(fx.sessionFor(fx.users.admin))
    const own = await confirm(fx)
    expect((await act(own.json.runId, 'approve')).status).toBe(403)
    const override = await act(own.json.runId, 'approve', { override: true })
    expect(override.status, JSON.stringify(override.json)).toBe(200)
    const audit = await prisma.auditTrail.findFirstOrThrow({ where: { recordId: own.json.runId, action: 'APPROVE' } })
    expect(JSON.parse(String(audit.newValues))).toMatchObject({ override: true })

    await prisma.company.update({ where: { id: fx.companyId }, data: { payrollRequireSecondApprover: false } })
    await loginAs(fx.sessionFor(fx.users.hr))
    for (const g of fx.guards) await attendance(g.id, ['PRESENT'], 9)
    const second = await confirm(fx, { periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    expect((await act(second.json.runId, 'approve')).status).toBe(200)
  })

  it('approving in a locked period -> 422 PERIOD_LOCKED', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Locked Payroll' })
    for (const g of fx.guards) await attendance(g.id, Array(3).fill('PRESENT'))
    await loginAs(fx.sessionFor(fx.users.hr))
    const c = await confirm(fx)
    await loginAs(fx.sessionFor(fx.users.finance))
    await callRoute(lockDates.POST, { method: 'POST', path: '/api/finance/lock-dates', body: { lockedUntil: '2026-11-30' } })
    await loginAs(fx.sessionFor(fx.users.admin))
    const r = await act(c.json.runId, 'approve')
    expect([r.status, r.json.code]).toEqual([422, 'PERIOD_LOCKED'])
  })
})

describe('A3 statutory tables and warnings', () => {
  const preview = () => callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=preview', body: nov })
  const addAndApprove = async (fx: ZZ, body: Record<string, unknown>) => {
    await loginAs(fx.sessionFor(fx.users.hr))
    const r = await callRoute(tables.POST, { method: 'POST', path: '/api/hr/statutory-tables', body: { currency: 'USD', sourceDocument: 'Test fixture (not a real schedule)', ...body } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    await loginAs(fx.sessionFor(fx.users.admin))
    expect((await callRoute(table.PUT, { method: 'PUT', path: `/api/hr/statutory-tables/${r.json.table.id}?action=approve`, params: { id: r.json.table.id } })).status).toBe(200)
  }

  it('with no approved tables, nothing is deducted and the preview warns', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST No Tables', bank1Funds: 0 })
    for (const g of fx.guards) await attendance(g.id, Array(4).fill('PRESENT'))
    await loginAs(fx.sessionFor(fx.users.hr))
    const r = await preview()
    expect(r.json.totalDeductions).toBe(0)
    expect(r.json.warnings).toContain('No approved PAYE table is effective for this period')
  })

  it('a version past its effectiveTo no longer applies; effectiveTo before effectiveFrom is rejected', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST Expired', bank1Funds: 0 })
    for (const g of fx.guards) await attendance(g.id, Array(26).fill('PRESENT'))
    await loginAs(fx.sessionFor(fx.users.hr))
    const bad = await callRoute(tables.POST, { method: 'POST', path: '/api/hr/statutory-tables', body: { kind: 'NSSA', effectiveFrom: '2026-06-01', effectiveTo: '2026-01-01', sourceDocument: 'Bad dates', config: NSSA } })
    expect(bad.status).toBe(400)
    await addAndApprove(fx, { kind: 'NSSA', effectiveFrom: '2025-01-01', effectiveTo: '2026-10-31', config: NSSA })
    await loginAs(fx.sessionFor(fx.users.hr))
    expect((await preview()).json.warnings).toContain('No approved NSSA table is effective for this period')
    await addAndApprove(fx, { kind: 'NSSA', effectiveFrom: '2026-11-01', config: NSSA })
    await loginAs(fx.sessionFor(fx.users.hr))
    const r = await preview()
    expect(r.json.warnings).not.toContain('No approved NSSA table is effective for this period')
    expect(r.json.previews[0].deductionLines.find((l: { name: string }) => l.name === 'NSSA (employee)').amount).toBe(7.02)
  })

  it('pay below the NEC grade minimum warns on preview but does not block the run', async () => {
    const fx = await seedZZTest({ label: 'ZZTEST NEC', bank1Funds: 0 })
    for (const g of fx.guards) await attendance(g.id, Array(5).fill('PRESENT'))
    await addAndApprove(fx, { kind: 'NEC', effectiveFrom: '2026-01-01', config: { employeeRate: 0, employerRate: 0, gradeMinimums: { Guard: 200 } } })
    await loginAs(fx.sessionFor(fx.users.hr))
    const r = await preview()
    expect(r.json.warnings.some((w: string) => /Monthly rate 156\.00 is below the NEC minimum 200\.00 for grade Guard/.test(w)), JSON.stringify(r.json.warnings)).toBe(true)
    expect((await confirm(fx)).status).toBe(201)
  })
})
