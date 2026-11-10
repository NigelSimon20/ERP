import { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient
const D = Prisma.Decimal
const ZERO = new D(0)

// P1-2: posted journal lines are the single source of truth. Every
// statement, dashboard KPI and the AI helpdesk read figures from here, summed
// exactly in Postgres (numeric), never from stored current_balance.

export interface LedgerAccountBalance {
  id: string
  code: string | null
  name: string | null
  type: string | null
  subtype: string | null
  debit: Prisma.Decimal
  credit: Prisma.Decimal
  // Signed by normal side: debit - credit for ASSET/EXPENSE, credit - debit otherwise.
  balance: Prisma.Decimal
}

const NORMAL_DEBIT = new Set(['ASSET', 'EXPENSE'])

// entry_date is TEXT holding either YYYY-MM-DD or a full ISO timestamp;
// string comparison against an ISO bound orders both correctly.
export function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setUTCHours(23, 59, 59, 999)
  return e
}

// `to` omitted = every posted line, including future-dated ones (what stored
// balances reflect; used by the reconcile job).
export async function ledgerBalances(db: Db, companyId: string, range: { from?: Date; to?: Date }): Promise<LedgerAccountBalance[]> {
  const from = range.from ? range.from.toISOString() : null
  const to = range.to ? range.to.toISOString() : null
  const rows = await db.$queryRaw<{ id: string; account_code: string | null; account_name: string | null; account_type: string | null; account_subtype: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
    SELECT a.id, a.account_code, a.account_name, a.account_type, a.account_subtype,
           COALESCE(SUM(l.debit), 0)::numeric AS debit, COALESCE(SUM(l.credit), 0)::numeric AS credit
    FROM chart_of_accounts a
    LEFT JOIN journal_lines l ON l."accountId" = a.id AND EXISTS (
      SELECT 1 FROM journal_entries e
      WHERE e.id = l."journalEntryId" AND e."companyId" = a."companyId" AND e.status = 'POSTED'
        AND (${to}::text IS NULL OR e.entry_date <= ${to}::text) AND (${from}::text IS NULL OR e.entry_date >= ${from}::text)
    )
    WHERE a."companyId" = ${companyId}
    GROUP BY a.id
    ORDER BY a.account_code NULLS LAST, a.id`
  return rows.map((r) => {
    const debit = new D(r.debit)
    const credit = new D(r.credit)
    return {
      id: r.id, code: r.account_code, name: r.account_name, type: r.account_type, subtype: r.account_subtype,
      debit, credit, balance: NORMAL_DEBIT.has(r.account_type ?? '') ? debit.sub(credit) : credit.sub(debit),
    }
  })
}

const sum = (rows: LedgerAccountBalance[], type: string) =>
  rows.filter((r) => r.type === type).reduce((s, r) => s.add(r.balance), ZERO)

export interface IncomeStatement {
  revenueRows: LedgerAccountBalance[]
  expenseRows: LedgerAccountBalance[]
  totalRevenue: Prisma.Decimal
  totalExpenses: Prisma.Decimal
  netProfit: Prisma.Decimal
}

export async function incomeStatement(db: Db, companyId: string, from: Date, to: Date): Promise<IncomeStatement> {
  const rows = await ledgerBalances(db, companyId, { from, to })
  const totalRevenue = sum(rows, 'REVENUE')
  const totalExpenses = sum(rows, 'EXPENSE')
  return {
    revenueRows: rows.filter((r) => r.type === 'REVENUE'),
    expenseRows: rows.filter((r) => r.type === 'EXPENSE'),
    totalRevenue, totalExpenses, netProfit: totalRevenue.sub(totalExpenses),
  }
}

// Start of the fiscal year containing `asAt`, from Company.fiscalYearStart ("MM-DD").
export function fiscalYearStart(asAt: Date, mmdd = '01-01'): Date {
  const [m, d] = (/^\d{2}-\d{2}$/.test(mmdd) ? mmdd : '01-01').split('-').map(Number)
  const candidate = new Date(Date.UTC(asAt.getUTCFullYear(), m - 1, d))
  if (candidate > asAt) candidate.setUTCFullYear(candidate.getUTCFullYear() - 1)
  return candidate
}

export async function companyFiscalYearStart(db: Db, companyId: string, asAt: Date): Promise<Date> {
  const c = await db.company.findUnique({ where: { id: companyId }, select: { fiscalYearStart: true } })
  return fiscalYearStart(asAt, c?.fiscalYearStart ?? '01-01')
}

export interface LedgerBalanceSheet {
  asAt: Date
  fiscalYearStart: Date
  rows: LedgerAccountBalance[]
  assets: Prisma.Decimal
  liabilities: Prisma.Decimal
  equityAccounts: Prisma.Decimal
  // Net profit for the fiscal year to date: equals the Income Statement.
  currentYearEarnings: Prisma.Decimal
  // P&L of earlier years that was never closed into Retained Earnings.
  priorYearsEarnings: Prisma.Decimal
  equity: Prisma.Decimal
  // assets - (liabilities + equity). Non-zero means the ledger itself holds
  // unbalanced postings; it is reported, never plugged.
  difference: Prisma.Decimal
  balanced: boolean
}

export async function ledgerBalanceSheet(db: Db, companyId: string, asAt: Date): Promise<LedgerBalanceSheet> {
  const fyStart = await companyFiscalYearStart(db, companyId, asAt)
  const [all, ytd] = await Promise.all([
    ledgerBalances(db, companyId, { to: asAt }),
    incomeStatement(db, companyId, fyStart, asAt),
  ])
  const assets = sum(all, 'ASSET')
  const liabilities = sum(all, 'LIABILITY')
  const equityAccounts = sum(all, 'EQUITY')
  const allTimeProfit = sum(all, 'REVENUE').sub(sum(all, 'EXPENSE'))
  const currentYearEarnings = ytd.netProfit
  const priorYearsEarnings = allTimeProfit.sub(currentYearEarnings)
  const equity = equityAccounts.add(currentYearEarnings).add(priorYearsEarnings)
  const difference = assets.sub(liabilities.add(equity))
  return {
    asAt, fiscalYearStart: fyStart,
    rows: all.filter((r) => r.type === 'ASSET' || r.type === 'LIABILITY' || r.type === 'EQUITY'),
    assets, liabilities, equityAccounts, currentYearEarnings, priorYearsEarnings, equity, difference,
    balanced: difference.isZero(),
  }
}

export async function ledgerTrialBalance(db: Db, companyId: string, from: Date, to: Date) {
  const rows = (await ledgerBalances(db, companyId, { from, to })).filter((r) => !r.debit.isZero() || !r.credit.isZero())
  const grandDebit = rows.reduce((s, r) => s.add(r.debit), ZERO)
  const grandCredit = rows.reduce((s, r) => s.add(r.credit), ZERO)
  return { rows, grandDebit, grandCredit, difference: grandDebit.sub(grandCredit), balanced: grandDebit.eq(grandCredit) }
}
