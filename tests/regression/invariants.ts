import { expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ledgerBalances } from '@/lib/reports/ledger'
import * as customers from '@/app/api/finance/customers/route'
import * as suppliers from '@/app/api/finance/suppliers/route'
import * as bankAccounts from '@/app/api/finance/bank-accounts/route'
import { loginAs, callRoute } from '../helpers/api'
import type { ZZ } from '../fixtures/seed'

const D = Prisma.Decimal

// Invariants the brief says become true only once a fix lands. Remove the
// entry in the fix's commit, which turns the check on for every file.
//   AR_SUBLEDGER    -> A2 (credit notes reduce invoice and customer balances)
//   AP_SUBLEDGER    -> A1 (every payment settles a bill, an expense or an advance)
//   BANK_CALCULATED -> A4 (calculated balance comes from the ledger)
export const PENDING = new Set<string>(['AR_SUBLEDGER', 'AP_SUBLEDGER', 'BANK_CALCULATED'])

// Run in afterAll of every regression file. Logs in as the tenant's admin
// (afterAll runs last, so this doesn't disturb the tests' own session).
export async function assertLedgerInvariants(fx: ZZ) {
  const problems: string[] = []

  // 1. Σ debits = Σ credits over all posted lines.
  const [sum] = await prisma.$queryRaw<{ debit: Prisma.Decimal | null; credit: Prisma.Decimal | null }[]>`
    SELECT SUM(l.debit) AS debit, SUM(l.credit) AS credit FROM journal_lines l
    JOIN journal_entries e ON e.id = l."journalEntryId"
    WHERE e."companyId" = ${fx.companyId} AND e.status = 'POSTED'`
  const dr = new D(sum?.debit ?? 0), cr = new D(sum?.credit ?? 0)
  if (!dr.eq(cr)) problems.push(`posted debits ${dr} != credits ${cr}`)

  const gl = new Map((await ledgerBalances(prisma, fx.companyId, {})).map((a) => [a.id, a.balance]))
  await loginAs(fx.sessionFor(fx.users.admin))

  // 2. GL 1100 = Σ customer outstanding (the customer list's figure).
  if (!PENDING.has('AR_SUBLEDGER')) {
    const list = await callRoute(customers.GET, { path: '/api/finance/customers' })
    const total = (list.json.customers as { outstandingBal: number }[]).reduce((s, c) => s.add(c.outstandingBal), new D(0))
    const control = gl.get(fx.accounts.receivables.id) ?? new D(0)
    if (!total.eq(control)) problems.push(`customer outstanding ${total} != GL 1100 ${control}`)
  }

  // 3. GL 2000 = Σ supplier outstanding.
  if (!PENDING.has('AP_SUBLEDGER')) {
    const list = await callRoute(suppliers.GET, { path: '/api/finance/suppliers' })
    const total = (list.json.suppliers as { outstandingBal: number }[]).reduce((s, c) => s.add(c.outstandingBal), new D(0))
    const control = gl.get(fx.accounts.payables.id) ?? new D(0)
    if (!total.eq(control)) problems.push(`supplier outstanding ${total} != GL 2000 ${control}`)
  }

  // 4. Each bank account: stored balance = its GL account (= calculated, after A4).
  const banks = await callRoute(bankAccounts.GET, { path: '/api/finance/bank-accounts' })
  for (const b of banks.json.accounts as { id: string; account_name: string; chart_account_id: string | null; currentBalance: number; calculatedBalance: number }[]) {
    if (!b.chart_account_id) continue
    const glBal = gl.get(b.chart_account_id) ?? new D(0)
    if (!glBal.eq(b.currentBalance)) problems.push(`${b.account_name}: stored ${b.currentBalance} != GL ${glBal}`)
    if (!PENDING.has('BANK_CALCULATED') && !glBal.eq(b.calculatedBalance)) problems.push(`${b.account_name}: calculated ${b.calculatedBalance} != GL ${glBal}`)
  }

  expect(problems, 'ledger invariants').toEqual([])
}
