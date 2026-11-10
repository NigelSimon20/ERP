import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { auditDiff } from '@/lib/audit'
import * as journals from '@/app/api/finance/journal-entries/route'
import * as journal from '@/app/api/finance/journal-entries/[id]/route'
import { seedCompany, type Fixture } from './helpers/fixtures'
import { loginAs, callRoute } from './helpers/api'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('P1-9 audit trail and maker-checker', () => {
  let fx: Fixture
  const headers = { 'x-forwarded-for': '196.43.5.10, 10.0.0.1', 'user-agent': 'Vitest/2 (audit check)', 'x-vercel-id': 'cpt1::abc123' }
  const draft = async (amount: number) => {
    const r = await callRoute(journals.POST, { method: 'POST', path: '/api/finance/journal-entries', headers, body: {
      entryDate: '2026-11-06', description: 'Audit check', lines: [{ accountId: fx.accounts.bank.id, debit: amount, credit: 0 }, { accountId: fx.accounts.revenue.id, debit: 0, credit: amount }],
    } })
    expect(r.status, JSON.stringify(r.json)).toBe(201)
    return r.json.entry.id as string
  }
  const post = (id: string) => callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${id}?action=post`, params: { id }, headers })

  beforeAll(async () => {
    fx = await seedCompany('Audit Co')
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('posting a journal writes a POST row with the before/after diff, user, IP, user agent and request id', async () => {
    const id = await draft(25)
    expect((await post(id)).status).toBe(200)
    const row = await prisma.auditTrail.findFirstOrThrow({ where: { recordId: id, action: 'POST' } })
    expect(row).toMatchObject({
      userId: fx.users.finance.id, module: 'JournalEntries',
      ipAddress: '196.43.5.10', userAgent: 'Vitest/2 (audit check)', requestId: 'cpt1::abc123',
    })
    expect(row.changes).toMatchObject({ status: ['DRAFT', 'POSTED'], totalDebit: [null, 25] })
  })

  it('voiding writes a VOID row', async () => {
    const id = await draft(5)
    await post(id)
    const v = await callRoute(journal.POST, { method: 'POST', path: `/api/finance/journal-entries/${id}?action=void`, params: { id }, headers })
    expect(v.status).toBe(200)
    const row = await prisma.auditTrail.findFirstOrThrow({ where: { recordId: id, action: 'VOID' } })
    expect(row.changes).toMatchObject({ status: ['POSTED', 'VOID'] })
  })

  it('the audit table is append-only', async () => {
    const row = await prisma.auditTrail.findFirstOrThrow({ where: { companyId: fx.companyId } })
    await expect(prisma.auditTrail.update({ where: { id: row.id }, data: { userName: 'tampered' } })).rejects.toThrow(/append-only/)
    await expect(prisma.auditTrail.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/)
  })

  it('above the threshold the creator cannot post their own journal; another finance user can', async () => {
    await prisma.company.update({ where: { id: fx.companyId }, data: { approvalThreshold: 1000 } })
    const small = await draft(999)
    expect((await post(small)).status).toBe(200)
    const big = await draft(1500)
    const self = await post(big)
    expect(self.status).toBe(403)
    expect(self.json.code).toBe('APPROVAL_REQUIRED')
    await loginAs(fx.sessionFor(fx.users.admin))
    expect((await post(big)).status).toBe(200)
    await loginAs(fx.sessionFor(fx.users.finance))
  })

  it('auditDiff keeps changed fields only', () => {
    expect(auditDiff({ a: 1, b: 2, updatedAt: 'x' }, { a: 1, b: 3, c: 4, updatedAt: 'y' })).toEqual({ b: [2, 3], c: [null, 4] })
  })
})
