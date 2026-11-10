import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { formatDate, formatDateTime, timeAgo } from '@/lib/utils'
import { GET } from '@/app/api/finance/journal-entries/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

describe('P0-1 date formatters never throw', () => {
  it.each([null, undefined, '', 'not-a-date', '275760-13-45'])('formatDate(%j) -> "—"', (v) => {
    expect(formatDate(v as any)).toBe('—')
    expect(formatDateTime(v as any)).toBe('—')
    expect(timeAgo(v as any)).toBe('—')
  })
  it('still formats a valid date', () => {
    expect(formatDate('2026-03-05')).toBe('05 Mar 2026')
  })
})

describe('P0-1 GET /api/finance/journal-entries', () => {
  let fx: Fixture
  beforeAll(async () => {
    fx = await seedCompany('Journals Co')
    await prisma.journalEntry.createMany({
      data: [
        // Imported (Base44-style) row: number only in entry_number, no date.
        { id: crypto.randomUUID(), companyId: fx.companyId, entry_number: 'JE-IMPORT-1', entry_date: null, description: 'Imported', status: 'POSTED' },
        { id: crypto.randomUUID(), companyId: fx.companyId, reference: 'RS-JE-000001', entry_date: '2026-03-05', description: 'App-created', status: 'DRAFT' },
      ],
    })
  })

  it('returns a stable camelCase DTO, with date null instead of a crash-inducing undefined', async () => {
    await loginAs(fx.sessionFor(fx.users.finance))
    const { status, json } = await callRoute(GET, { path: '/api/finance/journal-entries' })
    expect(status).toBe(200)
    expect(json.total).toBe(2)
    const imported = json.entries.find((e: any) => e.description === 'Imported')
    expect(imported).toEqual({
      id: expect.any(String), reference: 'JE-IMPORT-1', date: null, description: 'Imported',
      status: 'POSTED', totalDebit: 0, totalCredit: 0,
    })
    // No raw snake_case columns leak through.
    expect(imported).not.toHaveProperty('entry_date')
    expect(json.entries.find((e: any) => e.reference === 'RS-JE-000001').date).toBe('2026-03-05')
  })

  it('rejects an anonymous request', async () => {
    await loginAs(null)
    const { status } = await callRoute(GET, { path: '/api/finance/journal-entries' })
    expect(status).toBe(401)
  })
})
