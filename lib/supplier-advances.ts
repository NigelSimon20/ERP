import { Prisma } from '@prisma/client'
import { ensureSystemAccount } from './system-accounts'

export const SUPPLIER_ADVANCES_CODE = '1450'

// A1: money paid to a supplier before there is a bill is an asset (the
// supplier owes us goods or services), not a reduction of Accounts Payable.
export function ensureSupplierAdvancesAccount(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  return ensureSystemAccount(tx, companyId, {
    code: SUPPLIER_ADVANCES_CODE, name: 'Supplier Advances', type: 'ASSET', subtype: 'Current Asset',
    description: 'Payments made to suppliers before a bill exists.',
  })
}
