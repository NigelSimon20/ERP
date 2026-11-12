import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { seedZZTest } from '../fixtures/seed'
import { loginAs } from '../helpers/api'
import { transfer } from '../regression/actions'

vi.spyOn(console, 'error').mockImplementation(() => {})

// Found while testing A7: transfer references were unique across all
// tenants but numbered per company, so a second company's first transfer
// (TRF-000001) failed with a duplicate-key error.
describe('transfer references are unique per company', () => {
  it('two companies can each make their first transfer', async () => {
    const [x, y] = [await seedZZTest({ label: 'ZZTEST TRF X' }), await seedZZTest({ label: 'ZZTEST TRF Y' })]
    for (const fx of [x, y]) {
      await loginAs(fx.sessionFor(fx.users.finance))
      const r = await transfer(fx, { amount: 1 })
      expect(r.status, JSON.stringify(r.json)).toBe(201)
    }
    const refs = await prisma.bankTransfer.findMany({ where: { companyId: { in: [x.companyId, y.companyId] } }, select: { reference: true } })
    expect(refs).toHaveLength(2)
    expect(refs[0].reference).toBe(refs[1].reference)
  })
})
