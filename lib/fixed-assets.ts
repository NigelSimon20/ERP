import crypto from 'crypto'
import { Prisma, PrismaClient, type FixedAsset } from '@prisma/client'
import { ApiError } from './api-error'
import { postJournal } from './gl-posting'
import { ensureOpeningBalanceEquity } from './opening-balances'
import { money } from './money'
import { checkLockDate } from './lock-dates'

type Db = PrismaClient | Prisma.TransactionClient

// P1-11: the asset register and the GL move together. The register showed
// $500 while GL 1500 held $1,000, and depreciation had never been posted.

export async function assetAccounts(db: Db, companyId: string) {
  const c = await db.company.findUnique({
    where: { id: companyId },
    select: { fixedAssetsAccountId: true, accumulatedDepreciationAccountId: true, depreciationExpenseAccountId: true },
  })
  return {
    fixedAssets: c?.fixedAssetsAccountId ?? null,
    accumulated: c?.accumulatedDepreciationAccountId ?? null,
    expense: c?.depreciationExpenseAccountId ?? null,
  }
}

// Dr Fixed Assets / Cr the bank it was paid from, or Opening Balance Equity
// when an already-owned asset is brought onto the books.
export async function postAssetAcquisition(
  tx: Prisma.TransactionClient,
  asset: Pick<FixedAsset, 'id' | 'companyId' | 'name' | 'purchasePrice' | 'purchaseDate'>,
  opts: { fixedAssetsAccountId: string; paidFromGlAccountId?: string | null; userId: string },
) {
  const credit = opts.paidFromGlAccountId ?? (await ensureOpeningBalanceEquity(tx, asset.companyId))
  return postJournal(tx, {
    companyId: asset.companyId,
    reference: `JE-FA-${asset.id.slice(0, 8)}`,
    entryDate: asset.purchaseDate.toISOString(),
    description: `Asset acquired: ${asset.name}`,
    lines: [
      { accountId: opts.fixedAssetsAccountId, debit: asset.purchasePrice, description: asset.name },
      { accountId: credit, credit: asset.purchasePrice, description: opts.paidFromGlAccountId ? 'Paid from bank' : 'Existing asset brought onto the books' },
    ],
    userId: opts.userId,
    sourceType: 'fixedAsset',
    sourceId: asset.id,
  })
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// One month of straight-line depreciation, never past the purchase price and
// never twice for the same month. Returns the amount charged (0 if none).
export async function depreciateAssetForPeriod(
  tx: Prisma.TransactionClient,
  asset: FixedAsset,
  period: string,
  accounts: { accumulated: string; expense: string },
  userId: string,
): Promise<number> {
  if (asset.status !== 'ACTIVE') return 0
  if (asset.lastDepreciatedPeriod && asset.lastDepreciatedPeriod >= period) return 0
  if (periodOf(asset.purchaseDate) > period) return 0
  const price = money(asset.purchasePrice)
  const remaining = price.sub(money(asset.accumulatedDepreciation))
  // decimal.js isPositive() is true for zero, hence gt(0).
  if (!remaining.gt(0) || asset.usefulLifeYears <= 0) return 0
  const monthly = money(price.div(asset.usefulLifeYears * 12))
  const charge = monthly.gt(remaining) ? remaining : monthly
  if (!charge.gt(0)) return 0

  // Claim the month first so a concurrent run can't charge it again.
  const claimed = await tx.fixedAsset.updateMany({
    where: { id: asset.id, OR: [{ lastDepreciatedPeriod: null }, { lastDepreciatedPeriod: { lt: period } }] },
    data: {
      lastDepreciatedPeriod: period,
      accumulatedDepreciation: { increment: charge },
      currentValue: { decrement: charge },
      updatedAt: new Date(),
    },
  })
  if (claimed.count === 0) return 0

  const [y, m] = period.split('-').map(Number)
  await postJournal(tx, {
    companyId: asset.companyId,
    reference: `JE-DEP-${period}-${asset.id.slice(0, 8)}`,
    entryDate: new Date(Date.UTC(y, m, 0)).toISOString(),
    description: `Depreciation ${period}: ${asset.name}`,
    lines: [
      { accountId: accounts.expense, debit: charge, description: asset.name },
      { accountId: accounts.accumulated, credit: charge, description: asset.name },
    ],
    userId,
    sourceType: 'depreciation',
    sourceId: asset.id,
  })
  return Number(charge)
}

export async function requireDepreciationAccounts(db: Db, companyId: string) {
  const a = await assetAccounts(db, companyId)
  if (!a.accumulated || !a.expense) {
    throw new ApiError('Set the Accumulated Depreciation and Depreciation Expense accounts in Settings → Company → GL accounts.', 400, 'ACCOUNT_NOT_CONFIGURED')
  }
  return { accumulated: a.accumulated, expense: a.expense }
}

function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return periodOf(new Date(Date.UTC(y, m, 1)))
}

function monthEnd(period: string): Date {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0, 23, 59, 59))
}

export interface DepreciationBlock { assetId: string; name: string; period: string }

// A9.3: month-end depreciation for every active asset, catching up every
// month not yet charged (from the purchase month, or the month after the
// last one charged) up to `period`, each month as its own journal dated at
// month end. A month inside a locked period is never posted: that asset
// stops there and is reported in `blocked`, so a month is never skipped
// silently (an accountant unlocks the period or books an adjustment).
export async function runMonthEndDepreciation(db: PrismaClient, companyId: string, period: string, userId = 'system') {
  const accounts = await requireDepreciationAccounts(db, companyId)
  const assets = await db.fixedAsset.findMany({ where: { companyId, status: 'ACTIVE' } })
  let total = 0, charged = 0
  const blocked: DepreciationBlock[] = []
  for (const a of assets) {
    let p = a.lastDepreciatedPeriod ? nextPeriod(a.lastDepreciatedPeriod) : periodOf(a.purchaseDate)
    for (; p <= period; p = nextPeriod(p)) {
      if (await checkLockDate(companyId, monthEnd(p))) {
        blocked.push({ assetId: a.id, name: a.name, period: p })
        break
      }
      const fresh = await db.fixedAsset.findUniqueOrThrow({ where: { id: a.id } })
      const amount = await db.$transaction((tx) => depreciateAssetForPeriod(tx, fresh, p, accounts, userId))
      if (amount > 0) { total += amount; charged++ }
      else if (money(fresh.purchasePrice).sub(money(fresh.accumulatedDepreciation)).lte(0)) break
    }
  }
  if (blocked.length) await notifyDepreciationBlocked(db, companyId, period, blocked)
  return { period, assets: assets.length, charged, total: Math.round(total * 100) / 100, blocked }
}

async function notifyDepreciationBlocked(db: PrismaClient, companyId: string, period: string, blocked: DepreciationBlock[]) {
  const admins = await db.user.findMany({ where: { companyId, active: true, role: { in: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'] } }, select: { id: true } })
  const list = blocked.slice(0, 5).map((b) => `${b.name} (${b.period})`).join(', ')
  await db.notification.createMany({
    data: admins.map((u) => ({
      id: crypto.randomUUID(), userId: u.id, companyId, type: 'DEPRECIATION_BLOCKED',
      title: `Depreciation to ${period}: ${blocked.length} asset(s) wait on a locked period`,
      message: `Not charged because the month is locked: ${list}. Unlock the period or post an adjustment.`,
      link: '/finance/fixed-assets',
    })),
  })
}
