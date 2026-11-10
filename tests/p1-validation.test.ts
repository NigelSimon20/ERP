import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { employeeProblems } from '@/lib/employee-rules'
import { attendanceRate } from '@/lib/attendance-hours'
import { formatCurrency } from '@/lib/utils'
import { getModuleConfig } from '@/lib/import-export/registry'
import * as employees from '@/app/api/hr/employees/route'
import * as employee from '@/app/api/hr/employees/[id]/route'
import * as incidents from '@/app/api/operations/incidents/route'
import * as overtime from '@/app/api/hr/overtime/route'
import * as inventory from '@/app/api/finance/inventory/route'
import * as salesInvoices from '@/app/api/finance/sales-invoices/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

const validEmployee = { name: 'Rudo Chikwanha', idNumber: '63-123456 A 12', dateOfBirth: '1990-04-02', dateHired: '2020-01-15', dailyRate: 5.45 }

describe('P1-11 employee validation (API and import)', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('HR Rules Co')
    await loginAs(fx.sessionFor(fx.users.hr))
  })
  const create = (body: Record<string, unknown>) => callRoute(employees.POST, { method: 'POST', path: '/api/hr/employees', body })

  it('creates a valid employee', async () => {
    const r = await create(validEmployee)
    expect(r.status, JSON.stringify(r.json)).toBe(201)
  })

  it('rejects a duplicate national ID, ignoring spaces, dashes and case (EMP-0332/0333)', async () => {
    const r = await create({ ...validEmployee, name: 'Someone Else', idNumber: '63123456a12' })
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('DUPLICATE_NATIONAL_ID')
  })

  it.each([
    ['a birth date in the future (2030-01-01)', { dateOfBirth: '2030-01-01' }, 'dateOfBirth'],
    ['the year 275760', { dateOfBirth: '275760-01-01' }, 'dateOfBirth'],
    ['an employee younger than 18', { dateOfBirth: new Date(Date.now() - 16 * 365.25 * 86400000).toISOString().slice(0, 10), dateHired: null }, 'dateOfBirth'],
    ['a hire date before the birth date', { dateOfBirth: '1990-01-01', dateHired: '1985-01-01' }, 'dateHired'],
    ['a daily rate of -50', { dailyRate: -50 }, 'dailyRate'],
    ['a 3,000-character name', { name: 'x'.repeat(3000) }, 'name'],
  ])('rejects %s with 400', async (_label, patch, field) => {
    const r = await create({ ...validEmployee, idNumber: crypto.randomUUID(), ...patch })
    expect(r.status, JSON.stringify(r.json)).toBe(400)
    expect(r.json.code).toBe('VALIDATION_ERROR')
    expect(r.json.fields).toHaveProperty(field)
  })

  it('update re-validates against the stored birth date', async () => {
    const c = await create({ ...validEmployee, idNumber: crypto.randomUUID() })
    const id = c.json.guard.id
    const r = await callRoute(employee.PUT, { method: 'PUT', path: `/api/hr/employees/${id}`, params: { id }, body: { dateHired: '1980-01-01' } })
    expect(r.status).toBe(400)
    expect(r.json.fields).toHaveProperty('dateHired')
  })

  it('imports apply the same rules', () => {
    const cfg = getModuleConfig('employees')
    expect(cfg.customValidate!({ full_name: 'Ok Name', date_of_birth: '1990-01-01', hire_date: '2015-01-01', daily_rate: 5 })).toEqual([])
    expect(cfg.customValidate!({ full_name: 'x'.repeat(200), date_of_birth: '2030-01-01', daily_rate: -1 })).toHaveLength(3)
  })

  it('employeeProblems accepts a blank optional field', () => {
    expect(employeeProblems({ name: 'A B', dateOfBirth: '', hireDate: null, dailyRate: '' })).toEqual([])
  })
})

describe('P1-11 operations validation', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Ops Rules Co')
    await loginAs(fx.sessionFor(fx.users.admin))
  })

  it('an unknown incident severity is a 400, not a 500 (BUG-017)', async () => {
    const r = await callRoute(incidents.POST, { method: 'POST', path: '/api/operations/incidents', body: { title: 'Test', description: 'Something happened', siteId: fx.site.id, severity: 'APOCALYPTIC' } })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('VALIDATION_ERROR')
  })

  it("an incident can't name another company's guard", async () => {
    const other = await seedCompany('Ops Other')
    const r = await callRoute(incidents.POST, { method: 'POST', path: '/api/operations/incidents', body: { title: 'Test', description: 'Something happened', siteId: fx.site.id, guardId: other.guard.id, severity: 'LOW' } })
    expect(r.status).toBe(404)
  })

  it('overtime is capped at 24h minus the scheduled shift (BUG-018)', async () => {
    await prisma.deployment.create({ data: { id: crypto.randomUUID(), companyId: fx.companyId, guardId: fx.guard.id, siteId: fx.site.id, startDate: new Date('2026-11-01'), shiftType: 'DAY', hoursPerDay: 12, ratePerHour: 2, status: 'ACTIVE', updatedAt: new Date() } })
    const tooMany = await callRoute(overtime.POST, { method: 'POST', path: '/api/hr/overtime', body: { guardId: fx.guard.id, date: '2026-11-04', hoursRequested: 30 } })
    expect(tooMany.status).toBe(400)
    expect(tooMany.json.code).toBe('OVERTIME_EXCEEDS_DAY')
    const ok = await callRoute(overtime.POST, { method: 'POST', path: '/api/hr/overtime', body: { guardId: fx.guard.id, date: '2026-11-04', hoursRequested: 8 } })
    expect(ok.status, JSON.stringify(ok.json)).toBe(201)
    const rest = await callRoute(overtime.POST, { method: 'POST', path: '/api/hr/overtime', body: { guardId: fx.guard.id, date: '2026-11-04', hoursRequested: 5 } })
    expect(rest.status).toBe(400)
  })

  it('attendance rate excludes OFF and LEAVE from the denominator (BUG-020)', () => {
    expect(attendanceRate(1419, 1866, 373)).toBe(95)
    expect(attendanceRate(0, 5, 5)).toBe(0)
  })

  it('stock is low only when quantity <= reorder level (BUG-022)', async () => {
    await prisma.inventoryItem.createMany({ data: [
      { id: crypto.randomUUID(), companyId: fx.companyId, itemName: 'Radios', category: 'Comms', unit: 'pcs', quantityOnHand: 10, reorderLevel: 5, unitCost: 1, totalValue: 10, updatedAt: new Date() },
      { id: crypto.randomUUID(), companyId: fx.companyId, itemName: 'Batons', category: 'Kit', unit: 'pcs', quantityOnHand: 5, reorderLevel: 5, unitCost: 1, totalValue: 5, updatedAt: new Date() },
    ] })
    const r = await callRoute(inventory.GET, { path: '/api/finance/inventory' })
    const byName = Object.fromEntries(r.json.items.map((i: { name?: string; itemName?: string; lowStock: boolean }) => [i.itemName ?? i.name, i.lowStock]))
    expect(byName.Radios).toBe(false)
    expect(byName.Batons).toBe(true)
  })

  it('invoice notes are kept when sent as `notes`', async () => {
    const r = await callRoute(salesInvoices.POST, { method: 'POST', path: '/api/finance/sales-invoices', body: {
      customerId: fx.customer.id, issueDate: '2026-11-01', dueDate: '2026-11-30', revenueAccountId: fx.accounts.revenue.id, notes: 'Per contract C-12',
      lineItems: [{ description: 'Guarding', quantity: 1, unitPrice: 10, taxRate: 0 }],
    } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    const stored = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: r.json.invoice.id } })
    expect(stored.overall_description).toBe('Per contract C-12')
  })

  it('formats each currency with its own code (BUG-021)', () => {
    // Intl separates a code from the amount with a non-breaking space.
    expect(formatCurrency(1234.5, 'ZWG')).toBe('ZWG\u00a01,234.50')
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatCurrency(1, 'not-a-code')).toBe('NOT-A-CODE 1.00')
  })
})
