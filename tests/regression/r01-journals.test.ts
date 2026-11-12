import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { ledgerTrialBalance } from '@/lib/reports/ledger'
import * as journals from '@/app/api/finance/journal-entries/route'
import { seedZZTest, type ZZ } from '../fixtures/seed'
import { loginAs, callRoute } from '../helpers/api'
import { createJournal, journalAction, postedJournal } from './actions'
import { assertLedgerInvariants } from './invariants'

vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Regression R1–R8, R28: journals', () => {
  let fx: ZZ
  let other: ZZ
  beforeAll(async () => {
    fx = await seedZZTest()
    other = await seedZZTest({ label: 'ZZTEST Other', bank1Funds: 0 })
    await loginAs(fx.sessionFor(fx.users.finance))
  })
  afterAll(async () => { await assertLedgerInvariants(fx) })

  // Not a bank GL account: a manual journal to one moves the GL but not the
  // bank's stored balance (reported finding F1), which the invariants catch.
  const bank = () => fx.accounts.prepaid.id
  const rev = () => fx.accounts.revenue.id

  it('R1: the journal list returns a valid `date` on every entry', async () => {
    await postedJournal([{ accountId: bank(), debit: 1 }, { accountId: rev(), credit: 1 }])
    const r = await callRoute(journals.GET, { path: '/api/finance/journal-entries' })
    expect(r.status).toBe(200)
    expect(r.json.entries.length).toBeGreaterThan(0)
    for (const e of r.json.entries) expect(Number.isNaN(new Date(e.date).getTime()), JSON.stringify(e)).toBe(false)
  })

  it('R2: unbalanced (Dr 10 / Cr 5) -> 400', async () => {
    expect((await createJournal([{ accountId: bank(), debit: 10 }, { accountId: rev(), credit: 5 }])).status).toBe(400)
  })

  it('R3: fewer than 2 lines -> 400', async () => {
    expect((await createJournal([{ accountId: bank(), debit: 10 }])).status).toBe(400)
  })

  it('R4: an all-zero line, or a line with both debit and credit -> 400', async () => {
    expect((await createJournal([{ accountId: bank(), debit: 0, credit: 0 }, { accountId: rev(), debit: 0, credit: 0 }])).status).toBe(400)
    expect((await createJournal([{ accountId: bank(), debit: 5, credit: 5 }, { accountId: rev(), debit: 5, credit: 5 }])).status).toBe(400)
  })

  it('R5: an unknown or foreign account -> 400 INVALID_ACCOUNT', async () => {
    for (const accountId of [crypto.randomUUID(), other.accounts.bank1.id]) {
      const r = await createJournal([{ accountId, debit: 10 }, { accountId: rev(), credit: 10 }])
      expect(r.status, JSON.stringify(r.json)).toBe(400)
      expect(r.json.code).toBe('INVALID_ACCOUNT')
    }
  })

  it('R6: date 2026-13-45 -> 400 VALIDATION_ERROR with no Prisma text', async () => {
    const r = await createJournal([{ accountId: bank(), debit: 1 }, { accountId: rev(), credit: 1 }], '2026-13-45')
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('VALIDATION_ERROR')
    expect(JSON.stringify(r.json)).not.toMatch(/prisma|invocation|companyId/i)
  })

  it('R7: exact cents — 0.1 + 0.2 posts against 0.3, the trial balance is exact, 1.005 is stored as 1.01', async () => {
    await postedJournal([{ accountId: fx.accounts.officeExpenses.id, debit: 0.1 }, { accountId: fx.accounts.officeExpenses.id, debit: 0.2 }, { accountId: bank(), credit: 0.3 }], '2026-11-04')
    const id = await postedJournal([{ accountId: bank(), debit: 1.005 }, { accountId: rev(), credit: 1.005 }], '2026-11-04')
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: id } })
    expect(lines.map((l) => (Number(l.debit) || Number(l.credit)).toFixed(2))).toEqual(['1.01', '1.01'])
    const tb = await ledgerTrialBalance(prisma, fx.companyId, new Date('2026-01-01'), new Date('2026-12-31T23:59:59Z'))
    expect(tb.difference.isZero()).toBe(true)
    expect(tb.balanced).toBe(true)
  })

  it('R8: post once (second -> 409); void once (second -> 400); a voided entry keeps its lines', async () => {
    const c = await createJournal([{ accountId: bank(), debit: 7 }, { accountId: rev(), credit: 7 }])
    const id = c.json.entry.id
    expect((await journalAction(id, 'post')).status).toBe(200)
    expect((await journalAction(id, 'post')).status).toBe(409)
    expect((await journalAction(id, 'void')).status).toBe(200)
    expect((await journalAction(id, 'void')).status).toBe(400)
    expect(await prisma.journalLine.count({ where: { journalEntryId: id } })).toBe(2)
  })

  it('R28: POST and VOID each write an audit row with action, old/new values, IP, user agent and requestId', async () => {
    const headers = { 'x-forwarded-for': '196.43.5.10', 'user-agent': 'Regression/1', 'x-vercel-id': 'cpt1::reg' }
    const c = await createJournal([{ accountId: bank(), debit: 3 }, { accountId: rev(), credit: 3 }], '2026-11-03', headers)
    const id = c.json.entry.id
    await journalAction(id, 'post', headers)
    await journalAction(id, 'void', headers)
    for (const [action, status] of [['POST', ['DRAFT', 'POSTED']], ['VOID', ['POSTED', 'VOID']]] as const) {
      const row = await prisma.auditTrail.findFirstOrThrow({ where: { recordId: id, action } })
      expect(row).toMatchObject({ userId: fx.users.finance.id, ipAddress: '196.43.5.10', userAgent: 'Regression/1', requestId: 'cpt1::reg' })
      expect(row.changes).toMatchObject({ status })
    }
  })
})
