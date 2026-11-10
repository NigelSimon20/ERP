import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { postJournal } from './gl-posting'
import { money, type MoneyInput } from './money'

export const OPENING_BALANCE_EQUITY_CODE = '3050'

// P1-3 (BUG-005): bank GL accounts 1013-1020 were created with opening
// balances written straight into current_balance and no journal, so assets
// never matched liabilities + equity. Opening balances are journals against
// Opening Balance Equity instead.
export async function ensureOpeningBalanceEquity(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const existing = await tx.chartOfAccount.findFirst({
    where: { companyId, account_code: OPENING_BALANCE_EQUITY_CODE, account_type: 'EQUITY' },
    select: { id: true },
  })
  if (existing) return existing.id
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await tx.chartOfAccount.create({
    data: {
      id, companyId, account_code: OPENING_BALANCE_EQUITY_CODE, account_name: 'Opening Balance Equity',
      account_type: 'EQUITY', account_subtype: 'Equity', is_active: true, current_balance: 0,
      description: 'Contra account for opening balances (balanced journals, never typed into current_balance).',
      created_date: now, updated_date: now,
    },
  })
  return id
}

// Debit-normal accounts (assets) open with Dr account / Cr equity; a negative
// amount (an overdraft) swaps sides.
export async function postOpeningBalance(
  tx: Prisma.TransactionClient,
  params: { companyId: string; accountId: string; amount: MoneyInput; entryDate: string; userId: string; label: string },
): Promise<string | null> {
  const amount = money(params.amount)
  if (amount.isZero()) return null
  const equityId = await ensureOpeningBalanceEquity(tx, params.companyId)
  const abs = amount.abs()
  const [debitAcct, creditAcct] = amount.isPositive() ? [params.accountId, equityId] : [equityId, params.accountId]
  return postJournal(tx, {
    companyId: params.companyId,
    reference: `JE-OB-${params.label}`,
    entryDate: params.entryDate,
    description: `Opening balance — ${params.label}`,
    lines: [
      { accountId: debitAcct, debit: abs, description: 'Opening balance' },
      { accountId: creditAcct, credit: abs, description: 'Opening balance' },
    ],
    userId: params.userId,
    sourceType: 'openingBalance',
    sourceId: params.accountId,
  })
}
