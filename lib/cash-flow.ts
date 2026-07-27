import { Prisma, PrismaClient } from '@prisma/client'
import { round2dp } from './calculations'

type Db = PrismaClient | Prisma.TransactionClient

export interface CashFlowLine { label: string; amount: number }
export interface CashFlowSection { lines: CashFlowLine[]; total: number }
export interface CashFlowResult {
  from: Date
  to: Date
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  netChange: number
  openingCash: number
  closingCash: number
}

// Mirrors the free-text account_subtype classifier in lib/balance-sheet.ts
// (kept local rather than imported since which section an account lands in
// only affects presentation here -- see the derivation below for why the
// totals reconcile regardless of classification).
function isCurrent(subtype: string | null): boolean {
  if (!subtype) return true // unclassified defaults to current -- most accounts in this business are working-capital, not fixed assets
  const s = subtype.toLowerCase()
  if (s.includes('non-current') || s.includes('noncurrent') || s.includes('fixed') || s.includes('long term') || s.includes('long-term')) return false
  return true
}

async function balancesAsOf(db: Db, accountIds: string[], companyId: string, asAt: Date): Promise<Record<string, { debit: number; credit: number }>> {
  const postedEntries = await db.journalEntry.findMany({
    where: { companyId, status: 'POSTED', entry_date: { lte: asAt.toISOString() } },
    select: { id: true },
  })
  const aggs = await db.journalLine.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accountIds }, journalEntryId: { in: postedEntries.map((e) => e.id) } },
    _sum: { debit: true, credit: true },
  })
  return Object.fromEntries(aggs.map((a) => [a.accountId, { debit: Number(a._sum.debit ?? 0), credit: Number(a._sum.credit ?? 0) }]))
}

// Indirect method: Net Income for the period, adjusted for changes in
// working-capital (current) accounts under Operating; changes in
// non-current asset accounts under Investing; changes in non-current
// liabilities and equity under Financing. "Cash" is whichever ChartOfAccount
// rows are flagged is_bank_account (the accounts real BankAccount rows post
// to) -- excluded from all three sections since they ARE the thing being
// reconciled to.
//
// This nets to the balance sheet's own cash delta by construction: Assets =
// Liabilities + Equity(real) + NetIncome(period, unclosed) implies
// ΔCash = NetIncome + ΔLiabilities + ΔEquity - Δ(non-cash assets), which is
// exactly Operating + Investing + Financing as computed below, regardless of
// how individual accounts get bucketed between the three sections.
export async function computeCashFlow(db: Db, companyId: string, from: Date, to: Date): Promise<CashFlowResult> {
  const opening = new Date(from.getTime() - 86_400_000)

  const [revExpAccounts, balanceAccounts] = await Promise.all([
    db.chartOfAccount.findMany({ where: { companyId, account_type: { in: ['REVENUE', 'EXPENSE'] } }, select: { id: true, account_type: true } }),
    db.chartOfAccount.findMany({ where: { companyId, account_type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } }, select: { id: true, account_type: true, account_subtype: true, account_name: true, is_bank_account: true } }),
  ])

  const [postedInPeriod, openingBalances, closingBalances] = await Promise.all([
    db.journalEntry.findMany({ where: { companyId, status: 'POSTED', entry_date: { gte: from.toISOString(), lte: to.toISOString() } }, select: { id: true } }),
    balancesAsOf(db, balanceAccounts.map((a) => a.id), companyId, opening),
    balancesAsOf(db, balanceAccounts.map((a) => a.id), companyId, to),
  ])

  const periodLines = await db.journalLine.groupBy({
    by: ['accountId'],
    where: { accountId: { in: revExpAccounts.map((a) => a.id) }, journalEntryId: { in: postedInPeriod.map((e) => e.id) } },
    _sum: { debit: true, credit: true },
  })
  const periodMap = Object.fromEntries(periodLines.map((l) => [l.accountId, l._sum]))
  let revenue = 0, expenses = 0
  for (const a of revExpAccounts) {
    const debit = Number(periodMap[a.id]?.debit ?? 0)
    const credit = Number(periodMap[a.id]?.credit ?? 0)
    if (a.account_type === 'REVENUE') revenue += credit - debit
    else expenses += debit - credit
  }
  const netIncome = round2dp(revenue - expenses)

  // Normal-debit balance for ASSET, normal-credit balance for LIABILITY/EQUITY.
  const balanceOf = (map: Record<string, { debit: number; credit: number }>, id: string, type: string) => {
    const b = map[id] ?? { debit: 0, credit: 0 }
    return type === 'ASSET' ? b.debit - b.credit : b.credit - b.debit
  }

  const operatingLines: CashFlowLine[] = [{ label: 'Net Income', amount: netIncome }]
  const investingLines: CashFlowLine[] = []
  const financingLines: CashFlowLine[] = []
  let openingCash = 0
  let closingCash = 0

  for (const a of balanceAccounts) {
    const openBal = balanceOf(openingBalances, a.id, a.account_type ?? 'ASSET')
    const closeBal = balanceOf(closingBalances, a.id, a.account_type ?? 'ASSET')
    const delta = round2dp(closeBal - openBal)

    if (a.is_bank_account) {
      openingCash += openBal
      closingCash += closeBal
      continue
    }
    if (delta === 0) continue

    const label = a.account_name || 'Account'
    if (a.account_type === 'ASSET') {
      if (isCurrent(a.account_subtype)) operatingLines.push({ label: `(Increase)/Decrease in ${label}`, amount: -delta })
      else investingLines.push({ label: `Purchase/(Disposal) of ${label}`, amount: -delta })
    } else if (a.account_type === 'LIABILITY') {
      if (isCurrent(a.account_subtype)) operatingLines.push({ label: `Increase/(Decrease) in ${label}`, amount: delta })
      else financingLines.push({ label: `Increase/(Decrease) in ${label}`, amount: delta })
    } else {
      // EQUITY -- always financing (capital contributions/drawings, not a current/non-current concept)
      financingLines.push({ label: `Change in ${label}`, amount: delta })
    }
  }

  const sum = (lines: CashFlowLine[]) => round2dp(lines.reduce((s, l) => s + l.amount, 0))
  const operating = { lines: operatingLines, total: sum(operatingLines) }
  const investing = { lines: investingLines, total: sum(investingLines) }
  const financing = { lines: financingLines, total: sum(financingLines) }

  return {
    from,
    to,
    operating,
    investing,
    financing,
    netChange: round2dp(operating.total + investing.total + financing.total),
    openingCash: round2dp(openingCash),
    closingCash: round2dp(closingCash),
  }
}
