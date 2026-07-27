import { Prisma, PrismaClient } from '@prisma/client'
import { round2dp } from './calculations'

type Db = PrismaClient | Prisma.TransactionClient
const NORMAL_DEBIT = ['ASSET', 'EXPENSE']

export interface GeneralLedgerLine { date: string; reference: string; description: string; debit: number; credit: number; runningBalance: number }
export interface GeneralLedgerAccount { accountId: string; accountCode: string | null; accountName: string | null; type: string | null; openingBalance: number; closingBalance: number; lines: GeneralLedgerLine[] }
export interface GeneralLedgerResult { accounts: GeneralLedgerAccount[] }

// Per-account transaction detail with a running balance -- the drill-down
// view that neither the flat journal-entry list nor the trial-balance's
// per-account totals provide today.
export async function computeGeneralLedger(db: Db, companyId: string, from: Date, to: Date, accountId?: string): Promise<GeneralLedgerResult> {
  const accounts = await db.chartOfAccount.findMany({
    where: { companyId, ...(accountId ? { id: accountId } : {}) },
    select: { id: true, account_code: true, account_name: true, account_type: true },
    orderBy: { account_code: 'asc' },
  })
  if (!accounts.length) return { accounts: [] }

  // JournalLine has no Prisma relation back to JournalEntry (plain scalar
  // journalEntryId) -- resolve entries first, same two-step pattern used by
  // computeTrialBalance/computeBalanceSheet.
  const entries = await db.journalEntry.findMany({
    where: { companyId, status: 'POSTED', entry_date: { lte: to.toISOString() } },
    select: { id: true, entry_date: true, reference: true },
  })
  const entryMap = Object.fromEntries(entries.map((e) => [e.id, e]))

  const lines = await db.journalLine.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) }, journalEntryId: { in: entries.map((e) => e.id) } },
    select: { accountId: true, journalEntryId: true, debit: true, credit: true, description: true },
  })

  const result: GeneralLedgerAccount[] = accounts
    .map((a) => {
      const normalDebit = NORMAL_DEBIT.includes(a.account_type ?? 'ASSET')
      const accountLines = lines
        .filter((l) => l.accountId === a.id)
        .map((l) => ({ ...l, entryDate: entryMap[l.journalEntryId]?.entry_date ?? '', reference: entryMap[l.journalEntryId]?.reference ?? '' }))
        .sort((x, y) => (x.entryDate < y.entryDate ? -1 : x.entryDate > y.entryDate ? 1 : 0))

      let openingBalance = 0
      const periodLines: GeneralLedgerLine[] = []
      for (const l of accountLines) {
        const debit = Number(l.debit ?? 0)
        const credit = Number(l.credit ?? 0)
        if (new Date(l.entryDate) < from) {
          openingBalance += normalDebit ? debit - credit : credit - debit
        } else {
          periodLines.push({ date: l.entryDate, reference: l.reference, description: l.description ?? '', debit, credit, runningBalance: 0 })
        }
      }

      let running = openingBalance
      for (const line of periodLines) {
        running += normalDebit ? line.debit - line.credit : line.credit - line.debit
        line.runningBalance = round2dp(running)
      }

      return {
        accountId: a.id,
        accountCode: a.account_code,
        accountName: a.account_name,
        type: a.account_type,
        openingBalance: round2dp(openingBalance),
        closingBalance: round2dp(running),
        lines: periodLines,
      }
    })
    .filter((a) => a.lines.length > 0 || !!accountId)

  return { accounts: result }
}
