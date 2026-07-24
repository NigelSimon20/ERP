import { Prisma, PrismaClient } from '@prisma/client'
import { round2dp } from './calculations'

type Db = PrismaClient | Prisma.TransactionClient

const NORMAL_DEBIT = ['ASSET', 'EXPENSE']

function computeBalance(type: string, debit: number, credit: number) {
  return NORMAL_DEBIT.includes(type) ? debit - credit : credit - debit
}

// Real seeded account_subtype values are free text ('Current Asset', 'Fixed
// Asset', 'Current Liability', 'Long Term Liability', etc.) - classify by
// substring rather than assuming an enum. Anything unrecognized still counts
// toward the ASSET/LIABILITY grand total (unchanged from before this split
// existed) but is reported separately instead of silently mis-bucketed.
function classifySubtype(subtype: string | null): 'CURRENT' | 'NON_CURRENT' | 'UNCLASSIFIED' {
  if (!subtype) return 'UNCLASSIFIED'
  const s = subtype.toLowerCase()
  if (s.includes('current')) return s.includes('non-current') || s.includes('noncurrent') ? 'NON_CURRENT' : 'CURRENT'
  if (s.includes('fixed') || s.includes('long term') || s.includes('long-term') || s.includes('non-current') || s.includes('noncurrent')) return 'NON_CURRENT'
  return 'UNCLASSIFIED'
}

export interface BalanceSheetRow {
  id: string
  account_name: string | null
  account_code: string | null
  account_type: string | null
  account_subtype?: string | null
  name: string | null
  accountCode: string | null
  type: string | null
  balance: number
}

export interface BalanceSheetResult {
  asAt: Date
  rows: BalanceSheetRow[]
  assets: number
  liabilities: number
  equity: number
  balanced: boolean
  currentAssets: number
  nonCurrentAssets: number
  unclassifiedAssets: number
  currentLiabilities: number
  nonCurrentLiabilities: number
  unclassifiedLiabilities: number
  inventoryAssetBalance: number
}

export async function computeBalanceSheet(db: Db, companyId: string, asAt: Date): Promise<BalanceSheetResult> {
  // Include REVENUE/EXPENSE too, purely to roll their net into a synthetic
  // "Current Year Earnings" equity line below - without it, the sheet only
  // balances right after a formal period-close journal moves P&L into
  // Retained Earnings, which this system never does, so Assets would
  // permanently sit off from Liabilities+Equity by the un-closed net income.
  const accounts = await db.chartOfAccount.findMany({
    where: { account_type: { in: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] }, companyId },
    select: { id: true, account_name: true, account_code: true, account_type: true, account_subtype: true },
    orderBy: { account_code: 'asc' },
  })

  const postedEntries = await db.journalEntry.findMany({
    where: { companyId, status: 'POSTED', entry_date: { lte: asAt.toISOString() } },
    select: { id: true },
  })

  const lineAggs = await db.journalLine.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accounts.map((a) => a.id) }, journalEntryId: { in: postedEntries.map((e) => e.id) } },
    _sum: { debit: true, credit: true },
  })

  const lineMap = Object.fromEntries(lineAggs.map((l) => [l.accountId, l._sum]))
  const allRows: BalanceSheetRow[] = accounts.map((a) => ({
    ...a,
    name: a.account_name,
    accountCode: a.account_code,
    type: a.account_type,
    balance: computeBalance(a.account_type ?? 'ASSET', Number(lineMap[a.id]?.debit ?? 0), Number(lineMap[a.id]?.credit ?? 0)),
  }))

  const revenue = allRows.filter((r) => r.account_type === 'REVENUE').reduce((s, r) => s + r.balance, 0)
  const expenses = allRows.filter((r) => r.account_type === 'EXPENSE').reduce((s, r) => s + r.balance, 0)
  const currentYearEarnings = revenue - expenses

  const rows: BalanceSheetRow[] = [
    ...allRows.filter((r) => r.account_type !== 'REVENUE' && r.account_type !== 'EXPENSE'),
    { id: 'current-year-earnings', account_name: 'Current Year Earnings', account_code: '3900', account_type: 'EQUITY', name: 'Current Year Earnings', accountCode: '3900', type: 'EQUITY', balance: currentYearEarnings },
  ]

  const assets = round2dp(rows.filter((r) => r.account_type === 'ASSET').reduce((s, r) => s + r.balance, 0))
  const liabilities = round2dp(rows.filter((r) => r.account_type === 'LIABILITY').reduce((s, r) => s + r.balance, 0))
  const equity = round2dp(rows.filter((r) => r.account_type === 'EQUITY').reduce((s, r) => s + r.balance, 0))

  let currentAssets = 0, nonCurrentAssets = 0, unclassifiedAssets = 0
  let currentLiabilities = 0, nonCurrentLiabilities = 0, unclassifiedLiabilities = 0
  let inventoryAssetBalance = 0
  for (const r of rows) {
    if (r.account_type === 'ASSET') {
      const bucket = classifySubtype(r.account_subtype ?? null)
      if (bucket === 'CURRENT') currentAssets += r.balance
      else if (bucket === 'NON_CURRENT') nonCurrentAssets += r.balance
      else unclassifiedAssets += r.balance
      if ((r.account_name ?? '').toLowerCase().includes('inventory')) inventoryAssetBalance += r.balance
    } else if (r.account_type === 'LIABILITY') {
      const bucket = classifySubtype(r.account_subtype ?? null)
      if (bucket === 'CURRENT') currentLiabilities += r.balance
      else if (bucket === 'NON_CURRENT') nonCurrentLiabilities += r.balance
      else unclassifiedLiabilities += r.balance
    }
  }

  return {
    asAt,
    rows,
    assets,
    liabilities,
    equity,
    // Tolerance wider than a single cent: hundreds of historical journal
    // entries each carrying their own sub-cent rounding (multi-currency
    // conversions especially) accumulate to a few cents of immaterial drift
    // that isn't a real imbalance.
    balanced: Math.abs(assets - (liabilities + equity)) < 1,
    currentAssets: round2dp(currentAssets),
    nonCurrentAssets: round2dp(nonCurrentAssets),
    unclassifiedAssets: round2dp(unclassifiedAssets),
    currentLiabilities: round2dp(currentLiabilities),
    nonCurrentLiabilities: round2dp(nonCurrentLiabilities),
    unclassifiedLiabilities: round2dp(unclassifiedLiabilities),
    inventoryAssetBalance: round2dp(inventoryAssetBalance),
  }
}

export interface TrialBalanceRow {
  id: string
  account_name: string | null
  account_code: string | null
  account_type: string | null
  name: string | null
  accountCode: string | null
  type: string | null
  totalDebit: number
  totalCredit: number
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[]
  grandDebit: number
  grandCredit: number
  balanced: boolean
}

export async function computeTrialBalance(db: Db, companyId: string, from: Date, to: Date): Promise<TrialBalanceResult> {
  const accounts = await db.chartOfAccount.findMany({
    where: { companyId },
    select: { id: true, account_name: true, account_code: true, account_type: true },
    orderBy: { account_code: 'asc' },
  })

  const postedEntries = await db.journalEntry.findMany({
    where: { companyId, status: 'POSTED', entry_date: { gte: from.toISOString(), lte: to.toISOString() } },
    select: { id: true },
  })

  const lineAggs = await db.journalLine.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accounts.map((a) => a.id) }, journalEntryId: { in: postedEntries.map((e) => e.id) } },
    _sum: { debit: true, credit: true },
  })

  const lineMap = Object.fromEntries(lineAggs.map((l) => [l.accountId, l._sum]))
  const rows: TrialBalanceRow[] = accounts
    .map((a) => ({
      ...a,
      name: a.account_name,
      accountCode: a.account_code,
      type: a.account_type,
      totalDebit: Number(lineMap[a.id]?.debit ?? 0),
      totalCredit: Number(lineMap[a.id]?.credit ?? 0),
    }))
    .filter((r) => r.totalDebit > 0 || r.totalCredit > 0)

  const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0)
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0)

  return { rows, grandDebit, grandCredit, balanced: Math.abs(grandDebit - grandCredit) < 1 }
}
