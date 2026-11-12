import { describe, it, expect, beforeAll, vi } from 'vitest'
import crypto from 'crypto'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

// A9.4: POST /api/operations/patrols with a missing or invalid scheduledTime
// was a 500. Every /api/operations/* create route must answer bad input with
// a 4xx and a code, never a 500.
const ROUTES: [string, string, boolean][] = [
  ['attendance', '@/app/api/operations/attendance/route', false],
  ['coverage-requests', '@/app/api/operations/coverage-requests/route', false],
  ['coverage-requests/[id]/assign', '@/app/api/operations/coverage-requests/[id]/assign/route', true],
  ['deployments', '@/app/api/operations/deployments/route', false],
  ['equipment', '@/app/api/operations/equipment/route', false],
  ['equipment/[id]/issue', '@/app/api/operations/equipment/[id]/issue/route', true],
  ['equipment/issues/[issueId]/return', '@/app/api/operations/equipment/issues/[issueId]/return/route', true],
  ['incidents', '@/app/api/operations/incidents/route', false],
  ['occurrence-book', '@/app/api/operations/occurrence-book/route', false],
  ['patrols', '@/app/api/operations/patrols/route', false],
  ['risk-assessments', '@/app/api/operations/risk-assessments/route', false],
  ['site-inspections', '@/app/api/operations/site-inspections/route', false],
  ['sites', '@/app/api/operations/sites/route', false],
  ['vehicles', '@/app/api/operations/vehicles/route', false],
  ['vehicles/[id]/inspect', '@/app/api/operations/vehicles/[id]/inspect/route', true],
  ['visitors', '@/app/api/operations/visitors/route', false],
  ['visitors/[id]/checkout', '@/app/api/operations/visitors/[id]/checkout/route', true],
]

describe('A9.4 operations create routes reject bad input with a 4xx', () => {
  let fx: ZZ
  let bad: Record<string, unknown>
  beforeAll(async () => {
    fx = await seedZZTest({ bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.admin))
    const notADate = 'not-a-date'
    bad = {
      siteId: fx.sites.s1.id, guardId: fx.guards[0].id, scheduledTime: notADate, date: notADate, startDate: notADate, endDate: notADate,
      reportedAt: notADate, checkIn: notADate, checkOut: notADate, issueDate: notADate, expectedReturnDate: notADate, inspectionDate: notADate,
      assessmentDate: notADate, visitDate: notADate, entryTime: notADate, occurredAt: notADate, timeIn: notADate,
      hoursPerDay: 'abc', ratePerHour: 'abc', quantity: 'abc', mileage: 'abc', status: 'NOT_A_STATUS', severity: 'NOT_A_SEVERITY', title: 'x',
    }
  })

  it.each(ROUTES)('%s', async (name, mod, hasId) => {
    const { POST } = await import(/* @vite-ignore */ mod)
    const params: Record<string, string> = hasId ? { id: crypto.randomUUID(), issueId: crypto.randomUUID() } : {}
    for (const body of [{}, bad]) {
      const r = await callRoute(POST, { method: 'POST', path: `/api/operations/${name}`, body, params })
      expect(r.status, `${name} ${JSON.stringify(body).slice(0, 40)} -> ${JSON.stringify(r.json)}`).toBeLessThan(500)
      expect(r.status).toBeGreaterThanOrEqual(400)
    }
  })

  it('patrols: a missing or invalid scheduledTime is 400 VALIDATION_ERROR', async () => {
    const { POST } = await import('@/app/api/operations/patrols/route')
    for (const scheduledTime of [undefined, 'not-a-date']) {
      const r = await callRoute(POST, { method: 'POST', path: '/api/operations/patrols', body: { siteId: fx.sites.s1.id, guardId: fx.guards[0].id, scheduledTime } })
      expect([r.status, r.json.code]).toEqual([400, 'VALIDATION_ERROR'])
    }
  })
})
