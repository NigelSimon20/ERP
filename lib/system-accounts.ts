import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { ApiError } from './api-error'

// Finds or creates an account the system posts to by itself (1450 Supplier
// Advances, 2210 Net Pay Payable), inside the caller's transaction. An
// existing account with that code must be active and of the expected type.
export async function ensureSystemAccount(
  tx: Prisma.TransactionClient,
  companyId: string,
  a: { code: string; name: string; type: 'ASSET' | 'LIABILITY'; subtype: string; description: string },
): Promise<string> {
  const existing = await tx.chartOfAccount.findFirst({
    where: { companyId, account_code: a.code },
    select: { id: true, account_type: true, is_active: true },
  })
  if (existing) {
    if (existing.account_type !== a.type || existing.is_active === false) {
      throw new ApiError(`Account ${a.code} must be an active ${a.type} account (${a.name}). Fix it in the Chart of Accounts.`, 400, 'ACCOUNT_NOT_CONFIGURED')
    }
    return existing.id
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await tx.chartOfAccount.create({
    data: {
      id, companyId, account_code: a.code, account_name: a.name, account_type: a.type, account_subtype: a.subtype,
      is_active: true, current_balance: 0, description: a.description, created_date: now, updated_date: now,
    },
  })
  return id
}
