import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { fetchRbzRates } from '@/lib/fx/rbz'

// Fetching and parsing live in lib/fx/rbz.ts (A5); this file stores the result.
export type { RbzRate } from '@/lib/fx/rbz'

export async function syncRbzExchangeRates() {
  const { effectiveDate, rates } = await fetchRbzRates()

  for (const r of rates) {
    // No unique constraint on (baseCurrency, targetCurrency, effectiveDate),
    // so replace any existing row for the same pair/day rather than upsert,
    // making repeat cron runs / manual re-syncs on the same day idempotent.
    await prisma.exchangeRate.deleteMany({
      where: { baseCurrency: r.base, targetCurrency: r.target, effectiveDate },
    })
    await prisma.exchangeRate.create({
      data: {
        id: crypto.randomUUID(),
        baseCurrency: r.base,
        targetCurrency: r.target,
        rate: r.avg,
        effectiveDate,
      },
    })
  }

  return { effectiveDate: effectiveDate.toISOString(), count: rates.length, rates }
}
