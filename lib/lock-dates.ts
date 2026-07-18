import { prisma } from '@/lib/prisma'

/**
 * Returns an error message if `date` falls within a locked accounting period
 * for this company, or null if the date is open. Callers should 422 on a
 * non-null result. Previously only checked on invoice/journal-entry
 * *creation* — payments, receipts, transfers, and edits/voids to existing
 * invoices/entries could all still move money or GL balances inside a
 * period Finance had explicitly locked.
 */
export async function checkLockDate(companyId: string, date: Date): Promise<string | null> {
  const lockDate = await prisma.lockDate.findFirst({
    where: { companyId, lockedUntil: { gte: date } },
  })
  return lockDate ? `Period is locked until ${lockDate.lockedUntil.toLocaleDateString()}` : null
}
