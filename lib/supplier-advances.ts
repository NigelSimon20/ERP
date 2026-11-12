import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { ApiError } from './api-error'

export const SUPPLIER_ADVANCES_CODE = '1450'

// A1: money paid to a supplier before there is a bill is an asset (the
// supplier owes us goods or services), not a reduction of Accounts Payable.
// Finds or creates "1450 Supplier Advances" inside the caller's transaction.
export async function ensureSupplierAdvancesAccount(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const existing = await tx.chartOfAccount.findFirst({
    where: { companyId, account_code: SUPPLIER_ADVANCES_CODE },
    select: { id: true, account_type: true, is_active: true },
  })
  if (existing) {
    if (existing.account_type !== 'ASSET' || existing.is_active === false) {
      throw new ApiError(`Account ${SUPPLIER_ADVANCES_CODE} must be an active ASSET account (Supplier Advances). Fix it in the Chart of Accounts.`, 400, 'ACCOUNT_NOT_CONFIGURED')
    }
    return existing.id
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await tx.chartOfAccount.create({
    data: {
      id, companyId, account_code: SUPPLIER_ADVANCES_CODE, account_name: 'Supplier Advances',
      account_type: 'ASSET', account_subtype: 'Current Asset', is_active: true, current_balance: 0,
      description: 'Payments made to suppliers before a bill exists.',
      created_date: now, updated_date: now,
    },
  })
  return id
}
