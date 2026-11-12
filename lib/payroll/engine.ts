import { payeFor, type StatutoryTables } from './statutory'

export type PayBasis = 'DAILY' | 'MONTHLY' | 'HOURLY'

// Attendance statuses that are paid days (P1-10). LEAVE counts as paid;
// unpaid leave is recorded as ABSENT/AWOL or via an UNPAID leave request.
// Working days in a full month (the payroll route spreads standard hours over the same 26).
export const WORKING_DAYS_PER_MONTH = 26

export const PAID_DAY_STATUSES = ['PRESENT', 'INDUCTION_PAID', 'LEAVE'] as const

export interface PayInput {
  basis: PayBasis
  dailyRate: number
  monthlySalary: number
  hourlyRate: number
  paidDays: number
  hoursWorked: number
  overtimeHours: number
  // Used to derive an hourly rate for overtime on DAILY/MONTHLY pay.
  hoursPerDay: number
  standardHoursPerMonth: number
  overtimeMultiplier?: number
  grade?: string | null
  otherEarnings?: { name: string; amount: number }[]
  otherDeductions?: { name: string; amount: number }[]
  tables: StatutoryTables
}

export interface PayResult {
  basicSalary: number
  overtimePay: number
  grossPay: number
  deductions: { name: string; amount: number }[]
  employerContributions: { name: string; amount: number }[]
  totalDeductions: number
  totalEmployerContributions: number
  netPay: number
  warnings: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function resolvePayBasis(guard: { pay_basis: string | null; daily_rate: unknown; basic_salary: unknown }, companyDefault: string): PayBasis {
  const v = (guard.pay_basis ?? '').toUpperCase()
  if (v === 'DAILY' || v === 'MONTHLY' || v === 'HOURLY') return v
  // No explicit basis: use whichever rate is actually filled in, then the company default.
  if (Number(guard.daily_rate ?? 0) > 0) return 'DAILY'
  if (Number(guard.basic_salary ?? 0) > 0) return 'MONTHLY'
  return (['DAILY', 'MONTHLY', 'HOURLY'].includes(companyDefault) ? companyDefault : 'DAILY') as PayBasis
}

// Pure: same inputs, same payslip. Tested against a hand calculation.
export function computePay(i: PayInput): PayResult {
  const warnings: string[] = []
  const multiplier = i.overtimeMultiplier ?? 1.5

  let basicSalary: number
  let hourly: number
  if (i.basis === 'DAILY') {
    basicSalary = r2(i.dailyRate * i.paidDays)
    hourly = i.hoursPerDay > 0 ? i.dailyRate / i.hoursPerDay : 0
  } else if (i.basis === 'MONTHLY') {
    basicSalary = r2(i.monthlySalary)
    hourly = i.standardHoursPerMonth > 0 ? i.monthlySalary / i.standardHoursPerMonth : 0
  } else {
    basicSalary = r2(i.hourlyRate * i.hoursWorked)
    hourly = i.hourlyRate
  }
  const overtimePay = r2(i.overtimeHours * hourly * multiplier)
  const other = r2((i.otherEarnings ?? []).reduce((s, e) => s + e.amount, 0))
  const grossPay = r2(basicSalary + overtimePay + other)

  const deductions: { name: string; amount: number }[] = []
  const employer: { name: string; amount: number }[] = []
  const t = i.tables

  let nssaEmployee = 0
  if (t.NSSA) {
    const insurable = Math.min(grossPay, t.NSSA.insurableCeiling)
    nssaEmployee = r2((insurable * t.NSSA.employeeRate) / 100)
    deductions.push({ name: 'NSSA (employee)', amount: nssaEmployee })
    employer.push({ name: 'NSSA (employer)', amount: r2((insurable * t.NSSA.employerRate) / 100) })
  } else warnings.push('No approved NSSA table is effective for this period')

  // NSSA contributions are deductible before PAYE.
  if (t.PAYE) {
    const paye = payeFor(grossPay - nssaEmployee, t.PAYE)
    deductions.push({ name: 'PAYE', amount: paye })
    if (t.AIDS_LEVY) deductions.push({ name: 'AIDS Levy', amount: r2((paye * t.AIDS_LEVY.rateOfPaye) / 100) })
    else warnings.push('No approved AIDS Levy table is effective for this period')
  } else warnings.push('No approved PAYE table is effective for this period')

  if (t.NEC) {
    deductions.push({ name: 'NEC levy (employee)', amount: r2((grossPay * t.NEC.employeeRate) / 100) })
    employer.push({ name: 'NEC levy (employer)', amount: r2((grossPay * t.NEC.employerRate) / 100) })
    // A3: compare the full-month rate (not this period's attendance) with the
    // grade minimum, whatever the pay basis. A warning only; it never blocks.
    const minimum = i.grade ? t.NEC.gradeMinimums[i.grade] : undefined
    const monthlyRate = i.basis === 'MONTHLY' ? i.monthlySalary
      : i.basis === 'DAILY' ? r2(i.dailyRate * WORKING_DAYS_PER_MONTH)
      : r2(i.hourlyRate * i.standardHoursPerMonth)
    if (minimum !== undefined && monthlyRate < minimum) {
      warnings.push(`Monthly rate ${monthlyRate.toFixed(2)} is below the NEC minimum ${minimum.toFixed(2)} for grade ${i.grade}`)
    }
  }
  if (t.ZIMDEF) employer.push({ name: 'ZIMDEF', amount: r2((grossPay * t.ZIMDEF.employerRate) / 100) })

  for (const d of i.otherDeductions ?? []) deductions.push(d)

  const totalDeductions = r2(deductions.reduce((s, d) => s + d.amount, 0))
  const totalEmployerContributions = r2(employer.reduce((s, d) => s + d.amount, 0))
  return {
    basicSalary, overtimePay, grossPay, deductions, employerContributions: employer,
    totalDeductions, totalEmployerContributions, netPay: r2(grossPay - totalDeductions), warnings,
  }
}

// A run may only be confirmed when every payslip is internally consistent.
export function payrollRunProblems(slips: { guardName: string; grossPay: number; totalDeductions: number; netPay: number }[]): string[] {
  const problems: string[] = []
  const gross = r2(slips.reduce((s, p) => s + p.grossPay, 0))
  if (gross <= 0) problems.push('Total gross pay is zero: check daily rates and attendance before running payroll')
  for (const p of slips) {
    if (Math.round(p.netPay * 100) !== Math.round((p.grossPay - p.totalDeductions) * 100)) problems.push(`${p.guardName}: net pay does not equal gross minus deductions`)
    if (p.netPay < 0) problems.push(`${p.guardName}: net pay is negative`)
  }
  return problems
}
