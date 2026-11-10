import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest'
import { GET as getGuards } from '@/app/api/guards/route'
import { GET as getSites } from '@/app/api/operations/sites/route'
import { POST as createIncident } from '@/app/api/operations/incidents/route'
import { POST as createDeployment } from '@/app/api/operations/deployments/route'
import { POST as createPatrol } from '@/app/api/operations/patrols/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

describe('P0-2 GET /api/guards', () => {
  let fx: Fixture
  let other: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Guards Co')
    other = await seedCompany('Other Tenant')
  })

  it('returns only Active guards of the session company, as picker DTOs', async () => {
    await loginAs(fx.sessionFor(fx.users.ops))
    const { status, json } = await callRoute(getGuards, { path: '/api/guards' })
    expect(status).toBe(200)
    expect(json.guards).toHaveLength(1)
    expect(json.guards[0]).toMatchObject({ id: fx.guard.id, name: 'Tendai Moyo', employeeNumber: 'EMP-0001', rank: 'Guard', status: 'Active' })
    const ids = json.guards.map((g: any) => g.id)
    expect(ids).not.toContain(fx.inactiveGuard.id)
    expect(ids).not.toContain(other.guard.id)
  })

  it('is 401 without a session', async () => {
    await loginAs(null)
    expect((await callRoute(getGuards, { path: '/api/guards' })).status).toBe(401)
  })
})

describe('P0-2 forms can be completed with the dropdown data', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Ops Co')
    await loginAs(fx.sessionFor(fx.users.ops))
  })

  it('site and guard dropdowns are populated', async () => {
    const sites = await callRoute(getSites, { path: '/api/operations/sites' })
    const guards = await callRoute(getGuards, { path: '/api/guards' })
    expect(sites.json.sites.map((s: any) => s.name)).toContain('Main Gate')
    expect(guards.json.guards.map((g: any) => g.id)).toContain(fx.guard.id)
  })

  it('creates an incident', async () => {
    const { status, json } = await callRoute(createIncident, {
      method: 'POST', path: '/api/operations/incidents',
      body: { title: 'Perimeter breach', description: 'Fence cut near the north gate', siteId: fx.site.id, guardId: fx.guard.id, severity: 'HIGH', reportedAt: new Date().toISOString() },
    })
    expect(status, JSON.stringify(json)).toBe(201)
  })

  it('creates a deployment', async () => {
    const { status, json } = await callRoute(createDeployment, {
      method: 'POST', path: '/api/operations/deployments',
      body: { guardId: fx.guard.id, siteId: fx.site.id, shiftType: 'DAY', startDate: '2026-11-01', hoursPerDay: 12, ratePerHour: 2.5 },
    })
    expect(status, JSON.stringify(json)).toBe(201)
  })

  it('creates a patrol', async () => {
    const { status, json } = await callRoute(createPatrol, {
      method: 'POST', path: '/api/operations/patrols',
      body: { siteId: fx.site.id, guardId: fx.guard.id, scheduledTime: '2026-11-01T22:00:00.000Z' },
    })
    expect(status, JSON.stringify(json)).toBe(201)
  })
})

describe('P0-2 fetchList (page-side loader)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a 404 HTML page for one list yields [] and a toast, without blocking the other list', async () => {
    const toast = (await import('react-hot-toast')).default
    const { fetchList } = await import('@/lib/fetch-list')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/guards'
        ? new Response('<!DOCTYPE html><h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } })
        : new Response(JSON.stringify({ sites: [{ id: 's1', name: 'Main Gate' }] }), { status: 200 }),
    ))
    const [sites, guards] = await Promise.all([
      fetchList('/api/operations/sites', 'sites', 'sites'),
      fetchList('/api/guards', 'guards', 'guards'),
    ])
    expect(sites).toEqual([{ id: 's1', name: 'Main Gate' }])
    expect(guards).toEqual([])
    expect(toast.error).toHaveBeenCalledWith('Failed to load guards')
  })
})
