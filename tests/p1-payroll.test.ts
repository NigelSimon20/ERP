import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { payeFor } from '@/lib/payroll/statutory'
import { payrollRunProblems } from '@/lib/payroll/engine'
import * as payroll from '@/app/api/hr/payroll/route'
import * as tables from '@/app/api/hr/statutory-tables/route'
import * as table from '@/app/api/hr/statutory-tables/[id]/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

// Fictional test tables -- NOT real ZIMRA/NSSA rates. The hand calculation
// for each guard is in the expectations below.
const PAYE = { bands: [{ upTo: 100, rate: 0, deduct: 0 }, { upTo: 300, rate: 20, deduct: 20 }, { upTo: 1000, rate: 25, deduct: 35 }, { upTo: null, rate: 30, deduct: 85 }] }
const NSSA = { employeeRate: 4.5, employerRate: 4.5, insurableCeiling: 700 }

async function addAttendance(companyGuardId: string, statuses: string[]) {
  await prisma.attendance.createMany({
    data: statuses.map((status, i) => ({ id: crypto.randomUUID(), guardId: companyGuardId, date: new Date(Date.UTC(2026, 10, i + 1)), status: status as never })),
  })
}

describe('P1-10 statutory payroll', () => {
  let fx: Fixture
  const g = { g1: crypto.randomUUID(), g2: crypto.randomUUID(), g3: crypto.randomUUID() }
  const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30' }

  beforeAll(async () => {
    fx = await seedCompany('Payroll Co')
    const liabilities = { id: crypto.randomUUID(), companyId: fx.companyId, account_code: '2200', account_name: 'Payroll Liabilities', account_type: 'LIABILITY', is_active: true }
    await prisma.chartOfAccount.create({ data: liabilities })
    await prisma.company.update({ where: { id: fx.companyId }, data: { salariesExpenseAccountId: fx.accounts.expense.id, payrollLiabilitiesAccountId: liabilities.id } })
    // Only the three fixture guards are active.
    await prisma.guard.update({ where: { id: fx.guard.id }, data: { status: 'Resigned' } })
    await prisma.guard.createMany({ data: [
      { id: g.g1, companyId: fx.companyId, full_name: 'G1 Daily', employee_code: 'P-1', status: 'Active', daily_rate: 5.45 },
      { id: g.g2, companyId: fx.companyId, full_name: 'G2 Daily', employee_code: 'P-2', status: 'Active', daily_rate: 5.91 },
      { id: g.g3, companyId: fx.companyId, full_name: 'G3 Monthly', employee_code: 'P-3', status: 'Active', basic_salary: 900 },
    ] })
    await addAttendance(g.g1, Array(26).fill('PRESENT'))
    await addAttendance(g.g2, [...Array(20).fill('PRESENT'), 'LEAVE', 'LEAVE', 'INDUCTION_PAID', 'ABSENT', 'ABSENT', 'ABSENT', 'OFF', 'OFF', 'OFF', 'OFF'])
  })

  it('statutory tables need a second person to approve them', async () => {
    await loginAs(fx.sessionFor(fx.users.hr))
    const ids: string[] = []
    for (const [kind, config] of [['PAYE', PAYE], ['NSSA', NSSA], ['AIDS_LEVY', { rateOfPaye: 3 }], ['ZIMDEF', { employerRate: 1 }]] as const) {
      const r = await callRoute(tables.POST, { method: 'POST', path: '/api/hr/statutory-tables', body: { kind, effectiveFrom: '2026-01-01', sourceDocument: 'Test fixture (not a real schedule)', config } })
      expect(r.status, JSON.stringify(r.json)).toBe(201)
      ids.push(r.json.table.id)
    }
    const self = await callRoute(table.PUT, { method: 'PUT', path: `/api/hr/statutory-tables/${ids[0]}?action=approve`, params: { id: ids[0] } })
    expect(self.status).toBe(403)
    await loginAs(fx.sessionFor(fx.users.admin))
    for (const id of ids) expect((await callRoute(table.PUT, { method: 'PUT', path: `/api/hr/statutory-tables/${id}?action=approve`, params: { id } })).status).toBe(200)
  })

  it('rejects a malformed table', async () => {
    const r = await callRoute(tables.POST, { method: 'POST', path: '/api/hr/statutory-tables', body: { kind: 'PAYE', effectiveFrom: '2026-01-01', sourceDocument: 'Bad', config: { bands: [{ upTo: 100, rate: 0, deduct: 0 }] } } })
    expect(r.status).toBe(400)
  })

  it('payslips match the hand calculation (daily rate x paid days, monthly salary, PAYE after NSSA)', async () => {
    const r = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=preview', body: period })
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    const by = Object.fromEntries(r.json.previews.map((p: { guardId: string }) => [p.guardId, p]))
    const ded = (p: { deductionLines: { name: string; amount: number }[] }, name: string) => p.deductionLines.find((l) => l.name === name)?.amount
    const emp = (p: { employerContributions: { name: string; amount: number }[] }, name: string) => p.employerContributions.find((l) => l.name === name)?.amount

    // G1: 5.45 x 26 = 141.70; NSSA 4.5% = 6.38; PAYE on 135.32 = 20% - 20 = 7.06; AIDS 3% = 0.21.
    expect(by[g.g1]).toMatchObject({ payBasis: 'DAILY', paidDays: 26, grossPay: 141.7, totalDeductions: 13.65, netPay: 128.05 })
    expect([ded(by[g.g1], 'NSSA (employee)'), ded(by[g.g1], 'PAYE'), ded(by[g.g1], 'AIDS Levy')]).toEqual([6.38, 7.06, 0.21])
    expect([emp(by[g.g1], 'NSSA (employer)'), emp(by[g.g1], 'ZIMDEF')]).toEqual([6.38, 1.42])
    // G2: 20 present + 2 leave + 1 paid induction = 23 days x 5.91 = 135.93.
    expect(by[g.g2]).toMatchObject({ paidDays: 23, grossPay: 135.93, totalDeductions: 12.26, netPay: 123.67 })
    // G3: monthly 900; NSSA capped at the 700 ceiling = 31.50; PAYE on 868.50 = 25% - 35 = 182.13; AIDS 5.46.
    expect(by[g.g3]).toMatchObject({ payBasis: 'MONTHLY', grossPay: 900, totalDeductions: 219.09, netPay: 680.91 })
    expect(r.json.problems).toEqual([])
    expect(r.json.totalGross).toBe(1177.63)
  })

  it('confirming posts a balanced journal: Dr salaries / Cr liabilities / Cr bank', async () => {
    const r = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { ...period, bankAccountId: fx.bankAccount.id } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    const run = await prisma.payrollRun.findFirstOrThrow({ where: { companyId: fx.companyId } })
    expect(Number(run.totalNet)).toBe(932.63)
    const je = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fx.companyId, source_type: 'payrollRun', source_id: run.id } })
    const sums = await prisma.journalLine.aggregate({ where: { journalEntryId: je.id }, _sum: { debit: true, credit: true } })
    // Gross 1177.63 + employer contributions (NSSA 6.38+6.12+31.50, ZIMDEF 1.42+1.36+9.00) = 1233.41.
    expect(Number(sums._sum.debit)).toBe(1233.41)
    expect(Number(sums._sum.credit)).toBe(1233.41)
  })

  it('a zero-gross run cannot be confirmed (BUG-007)', async () => {
    const empty = await seedCompany('Zero Payroll Co')
    await prisma.company.update({ where: { id: empty.companyId }, data: { salariesExpenseAccountId: empty.accounts.expense.id } })
    await loginAs(empty.sessionFor(empty.users.admin))
    const r = await callRoute(payroll.POST, { method: 'POST', path: '/api/hr/payroll?action=confirm', body: { ...period, bankAccountId: empty.bankAccount.id } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('PAYROLL_INVALID')
    expect(await prisma.payrollRun.count({ where: { companyId: empty.companyId } })).toBe(0)
  })

  it('validation helpers', () => {
    expect(payeFor(868.5, PAYE)).toBe(182.13)
    expect(payeFor(50, PAYE)).toBe(0)
    expect(payrollRunProblems([{ guardName: 'X', grossPay: 100, totalDeductions: 10, netPay: 95 }])).toContain('X: net pay does not equal gross minus deductions')
    expect(payrollRunProblems([{ guardName: 'Y', grossPay: 10, totalDeductions: 20, netPay: -10 }])).toContain('Y: net pay is negative')
  })
})
