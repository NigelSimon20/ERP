import { Prisma, PrismaClient } from '@prisma/client'
import { round2dp } from './calculations'
import { ledgerBalanceSheet, ledgerTrialBalance } from './reports/ledger'

type Db = PrismaClient | Prisma.TransactionClient

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
  currentYearEarnings: number
  priorYearsEarnings: number
  difference: number
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
  // P1-2: from the ledger service. Current Year Earnings is the fiscal-year-
  // to-date net profit (= the Income Statement), earlier unclosed P&L is its
  // own line, and an imbalance is reported as `difference` -- never plugged.
  const bs = await ledgerBalanceSheet(db, companyId, asAt)
  const toRow = (r: { id: string; name: string | null; code: string | null; type: string | null; subtype?: string | null; balance: Prisma.Decimal }): BalanceSheetRow => ({
    id: r.id, account_name: r.name, account_code: r.code, account_type: r.type, account_subtype: r.subtype ?? null,
    name: r.name, accountCode: r.code, type: r.type, balance: Number(r.balance),
  })
  const rows: BalanceSheetRow[] = [
    ...bs.rows.map(toRow),
    toRow({ id: 'current-year-earnings', name: 'Current Year Earnings', code: '3900', type: 'EQUITY', balance: bs.currentYearEarnings }),
  ]
  if (!bs.priorYearsEarnings.isZero()) {
    rows.push(toRow({ id: 'prior-years-earnings', name: "Prior Years' Earnings (not yet closed)", code: '3950', type: 'EQUITY', balance: bs.priorYearsEarnings }))
  }

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
    assets: Number(bs.assets),
    liabilities: Number(bs.liabilities),
    equity: Number(bs.equity),
    currentYearEarnings: Number(bs.currentYearEarnings),
    priorYearsEarnings: Number(bs.priorYearsEarnings),
    difference: Number(bs.difference),
    // Exact: amounts are Decimal(18,2), so any difference is a real imbalance.
    balanced: bs.balanced,
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
  difference: number
  balanced: boolean
}

export async function computeTrialBalance(db: Db, companyId: string, from: Date, to: Date): Promise<TrialBalanceResult> {
  const tb = await ledgerTrialBalance(db, companyId, from, to)
  const rows: TrialBalanceRow[] = tb.rows.map((r) => ({
    id: r.id, account_name: r.name, account_code: r.code, account_type: r.type,
    name: r.name, accountCode: r.code, type: r.type,
    totalDebit: Number(r.debit), totalCredit: Number(r.credit),
  }))
  // BUG-011: was `< 1`, which reported 592,132.7628 vs .7328 as balanced.
  return { rows, grandDebit: Number(tb.grandDebit), grandCredit: Number(tb.grandCredit), difference: Number(tb.difference), balanced: tb.balanced }
}
