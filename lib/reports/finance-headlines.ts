import { Prisma, PrismaClient } from '@prisma/client'
import { buildCurrencyConverter } from '@/lib/currency'
import { incomeStatement, companyFiscalYearStart } from './ledger'
import { getReceivables } from './subledger'

type Db = PrismaClient | Prisma.TransactionClient

// A8: the finance headline figures, in the reporting currency, computed one
// way for every consumer: the finance dashboard and the AI helpdesk.

// Cash in bank: every active bank account's stored balance, converted to the
// reporting currency (accounts with no rate to convert through are skipped,
// as on the dashboard).
export async function cashInBank(db: Db, companyId: string, reportingCurrency: string, asAt = new Date()): Promise<number> {
  const [banks, convert] = await Promise.all([
    db.bankAccount.findMany({ where: { companyId, is_active: true }, select: { current_balance: true, currency: true } }),
    buildCurrencyConverter(reportingCurrency, asAt, db),
  ])
  let total = new Prisma.Decimal(0)
  for (const b of banks) {
    const c = convert(Number(b.current_balance ?? 0), b.currency)
    if (c.converted) total = total.add(new Prisma.Decimal(c.amount).toDecimalPlaces(2))
  }
  return Number(total)
}

export async function financeHeadlines(db: Db, companyId: string, asAt = new Date()) {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { currency: true } })
  const reportingCurrency = company?.currency || 'USD'
  const fyStart = await companyFiscalYearStart(db, companyId, asAt)
  const [is, receivables, cash] = await Promise.all([
    incomeStatement(db, companyId, fyStart, asAt),
    getReceivables(db, companyId),
    cashInBank(db, companyId, reportingCurrency, asAt),
  ])
  return {
    reportingCurrency,
    fiscalYearStart: fyStart,
    totalRevenue: Number(is.totalRevenue),
    totalExpenses: Number(is.totalExpenses),
    netProfit: Number(is.netProfit),
    outstandingReceivables: Number(receivables.total),
    cashInBank: cash,
  }
}
