import { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

// P1-11 (BUG-019/031): the employees API accepted a duplicate national ID,
// a birth date of 2030-01-01, the year 275760, a daily rate of -50 and a
// 3,000-character name. Same rules for create, update and imports.
export const MAX_NAME_LENGTH = 120
export const MIN_AGE = 18
export const MAX_AGE = 75

export interface EmployeeFields {
  name?: string | null
  dateOfBirth?: string | Date | null
  hireDate?: string | Date | null
  dailyRate?: unknown
  basicSalary?: unknown
}

export function normaliseNationalId(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function parseDate(v: string | Date | null | undefined): Date | null | 'invalid' {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return 'invalid'
  // new Date('1990-02-31') silently rolls over to 3 March; a calendar date
  // must come back out exactly as it went in.
  const ymd = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null
  if (ymd && d.toISOString().slice(0, 10) !== `${ymd[1]}-${ymd[2]}-${ymd[3]}`) return 'invalid'
  const y = d.getUTCFullYear()
  return y < 1900 || y > 2200 ? 'invalid' : d
}

function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear()
  const m = on.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--
  return age
}

export function employeeProblems(e: EmployeeFields, now = new Date()): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = []
  if (e.name !== undefined) {
    const name = (e.name ?? '').trim()
    if (!name) problems.push({ field: 'name', message: 'Name is required' })
    else if (name.length > MAX_NAME_LENGTH) problems.push({ field: 'name', message: `Name must be at most ${MAX_NAME_LENGTH} characters` })
  }
  const dob = parseDate(e.dateOfBirth)
  const hired = parseDate(e.hireDate)
  if (dob === 'invalid') problems.push({ field: 'dateOfBirth', message: 'Date of birth is not a valid date' })
  else if (dob) {
    const age = ageOn(dob, now)
    if (age < MIN_AGE || age > MAX_AGE) problems.push({ field: 'dateOfBirth', message: `Employees must be between ${MIN_AGE} and ${MAX_AGE} years old` })
  }
  if (hired === 'invalid') problems.push({ field: 'dateHired', message: 'Hire date is not a valid date' })
  else if (hired && dob && dob !== 'invalid' && hired <= dob) problems.push({ field: 'dateHired', message: 'Hire date must be after the date of birth' })
  for (const [field, v, label] of [['dailyRate', e.dailyRate, 'Daily rate'], ['basicSalary', e.basicSalary, 'Basic salary']] as const) {
    if (v == null || v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) problems.push({ field, message: `${label} must be greater than zero` })
  }
  return problems
}

// Same national ID (ignoring case, spaces and dashes) already on another
// employee of this company?
export async function nationalIdTaken(db: Db, companyId: string, idNumber: string, excludeId?: string): Promise<boolean> {
  const n = normaliseNationalId(idNumber)
  if (!n) return false
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM guards
    WHERE "companyId" = ${companyId} AND national_id IS NOT NULL
      AND upper(regexp_replace(national_id, '[^A-Za-z0-9]', '', 'g')) = ${n}
      AND (${excludeId ?? null}::text IS NULL OR id <> ${excludeId ?? null}::text)
    LIMIT 1`
  return rows.length > 0
}
