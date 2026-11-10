import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Converts `amount` (in `currency`) to the company's reporting currency
 * using the most recent ExchangeRate on or before `asOf`. ExchangeRate rows
 * store baseCurrency -> targetCurrency, e.g. baseCurrency=USD,
 * targetCurrency=ZWG, rate=26.68 means 1 USD = 26.68 ZWG.
 *
 * If `currency` already matches the reporting currency, or no rate can be
 * found (e.g. a discontinued currency like the pre-2024 ZWL that has no
 * successor rate to convert through), the amount is returned unconverted —
 * we don't fabricate a conversion rate we have no data for.
 */
export async function convertToReportingCurrency(
  amount: number,
  currency: string | null | undefined,
  reportingCurrency: string,
  asOf: Date = new Date(),
): Promise<number> {
  if (!currency || currency === reportingCurrency) return amount

  // reportingCurrency as base, currency as target (e.g. USD -> ZWG): divide.
  const direct = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: reportingCurrency, targetCurrency: currency, effectiveDate: { lte: asOf } },
    orderBy: { effectiveDate: 'desc' },
  })
  if (direct && Number(direct.rate) > 0) return amount / Number(direct.rate)

  // currency as base, reportingCurrency as target (e.g. ZWG -> USD): multiply.
  const inverse = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: currency, targetCurrency: reportingCurrency, effectiveDate: { lte: asOf } },
    orderBy: { effectiveDate: 'desc' },
  })
  if (inverse && Number(inverse.rate) > 0) return amount * Number(inverse.rate)

  return amount
}

/**
 * Builds a synchronous converter by loading every ExchangeRate row once
 * up-front (latest per base/target pair, as of `asOf`), instead of one query
 * per amount like `convertToReportingCurrency` does. Use this for dashboards
 * summing many rows (invoices, payments) to avoid an N+1 query storm.
 *
 * `convert()` reports whether it actually found a rate — callers that mix
 * currencies (e.g. a legacy currency like ZWL with no successor rate) should
 * treat unconverted amounts as excluded from a consolidated total rather
 * than silently adding raw foreign-currency figures into it.
 */
// Pass `db` when calling inside a transaction: using the global client there
// needs a second pooled connection per transaction, and concurrent
// transactions waiting on a row lock then exhaust the pool and stall.
export async function buildCurrencyConverter(reportingCurrency: string, asOf: Date = new Date(), db: Pick<Prisma.TransactionClient, 'exchangeRate'> = prisma) {
  const rates = await db.exchangeRate.findMany({
    where: { effectiveDate: { lte: asOf } },
    orderBy: { effectiveDate: 'desc' },
    select: { baseCurrency: true, targetCurrency: true, rate: true },
  })
  const rateMap = new Map<string, number>()
  for (const r of rates) {
    const key = `${r.baseCurrency}->${r.targetCurrency}`
    if (!rateMap.has(key)) rateMap.set(key, Number(r.rate))
  }

  return function convert(amount: number, currency: string | null | undefined): { amount: number; converted: boolean } {
    if (!currency || currency === reportingCurrency) return { amount, converted: true }

    const direct = rateMap.get(`${reportingCurrency}->${currency}`)
    if (direct && direct > 0) return { amount: amount / direct, converted: true }

    const inverse = rateMap.get(`${currency}->${reportingCurrency}`)
    if (inverse && inverse > 0) return { amount: amount * inverse, converted: true }

    return { amount, converted: false }
  }
}

/**
 * Distinct currencies actually used in a company's money-bearing records,
 * always including the reporting currency first — powers the dashboard
 * currency toggle (e.g. offering "ZWL" only when ZWL-denominated invoices,
 * payments, or bank accounts actually exist for this company).
 */
export async function listAvailableCurrencies(companyId: string, reportingCurrency: string): Promise<string[]> {
  const [invoices, payments, accounts] = await Promise.all([
    prisma.salesInvoice.findMany({ where: { companyId }, distinct: ['currency'], select: { currency: true } }),
    prisma.payment.findMany({ where: { companyId }, distinct: ['currency'], select: { currency: true } }),
    prisma.bankAccount.findMany({ where: { companyId }, distinct: ['currency'], select: { currency: true } }),
  ])
  const found = [...invoices, ...payments, ...accounts]
    .map((r) => r.currency)
    .filter((c): c is string => !!c)
  return Array.from(new Set([reportingCurrency, ...found]))
}
