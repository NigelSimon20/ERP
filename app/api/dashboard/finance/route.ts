import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DB_STATUS_OUTSTANDING, DB_STATUS_VOID } from '@/lib/invoice-status'
import { overdueQueryCutoff } from '@/lib/calculations'
import { buildCurrencyConverter, listAvailableCurrencies } from '@/lib/currency'

function monthKey(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function buildMonthlyChart(receipts: { date: Date; amount: number }[]) {
  const buckets: { month: string; revenue: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    buckets.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), revenue: 0, expenses: 0 })
  }
  receipts.forEach((r) => {
    const b = buckets.find((b) => b.month === monthKey(r.date))
    if (b) b.revenue += r.amount
  })
  return buckets
}

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const fiscalStart = new Date(now.getFullYear(), 0, 1)
  const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000)
  const overdueCutoff = overdueQueryCutoff(now)

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { currency: true } })
  const reportingCurrency = company?.currency || 'USD'

  const { searchParams } = new URL(req.url)
  const requestedCurrency = searchParams.get('currency')
  const viewCurrency = requestedCurrency || reportingCurrency
  const isNative = viewCurrency !== reportingCurrency

  const [availableCurrencies, convert] = await Promise.all([
    listAvailableCurrencies(companyId, reportingCurrency),
    isNative ? Promise.resolve(null) : buildCurrencyConverter(reportingCurrency, now),
  ])

  // amt() returns null when an amount can't be shown under the current view:
  // native mode drops anything not in that exact currency, consolidated mode
  // drops anything with no exchange rate to convert through (rather than
  // silently adding raw foreign-currency figures into a reporting-currency
  // total, which is the bug this toggle replaces).
  let excludedCount = 0
  function amt(value: unknown, currency: string | null): number | null {
    const n = Number(value ?? 0)
    if (isNative) return currency === viewCurrency ? n : null
    const { amount, converted } = convert!(n, currency)
    if (!converted) excludedCount++
    return converted ? amount : null
  }

  const [
    allInvoices, customerReceipts, otherPayments,
    bankAccounts, unpaidSuppliersAgg, lastPayroll, lowInventoryCount,
  ] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { companyId, status: { not: DB_STATUS_VOID } },
      select: { invoice_number: true, customer_id: true, total_amount: true, balance_due: true, due_date: true, status: true, currency: true },
    }),
    prisma.payment.findMany({
      where: { companyId, payment_type: 'Customer Receipt' },
      select: { id: true, payment_date: true, payment_number: true, amount: true, customer_id: true, currency: true },
      orderBy: { payment_date: 'desc' },
    }),
    prisma.payment.findMany({
      where: { companyId, payment_type: { not: 'Customer Receipt' } },
      select: { amount: true, payment_date: true, currency: true },
    }),
    prisma.bankAccount.findMany({ where: { companyId }, select: { id: true, bank_name: true, account_number: true, current_balance: true, currency: true }, take: 25 }),
    isNative
      ? Promise.resolve(null)
      : prisma.purchaseInvoice.aggregate({ where: { companyId, status: { not: 'PAID' } }, _sum: { balanceDue: true } }),
    prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { totalNet: true, periodStart: true, periodEnd: true } }),
    prisma.inventoryItem.count({ where: { companyId } }),
  ])

  let totalRevenue = 0
  let outstandingReceivables = 0
  let overdueAmount = 0
  let overdueCount = 0
  const debtorMap = new Map<string, { sum: number; minDue: string | null }>()
  const dueSoonList: { invoiceNumber: string; customerId: string | null; dueDate: string; balanceDue: number }[] = []

  for (const inv of allInvoices) {
    const total = amt(inv.total_amount, inv.currency)
    if (total !== null) totalRevenue += total

    if (!DB_STATUS_OUTSTANDING.includes(inv.status as string)) continue
    const bal = amt(inv.balance_due, inv.currency)
    if (bal === null) continue

    outstandingReceivables += bal

    if (inv.due_date && new Date(inv.due_date) >= now && new Date(inv.due_date) <= sevenDaysOut) {
      dueSoonList.push({ invoiceNumber: inv.invoice_number || '', customerId: inv.customer_id, dueDate: inv.due_date, balanceDue: bal })
    }
    if (bal > 0 && inv.customer_id) {
      const entry = debtorMap.get(inv.customer_id) ?? { sum: 0, minDue: null }
      entry.sum += bal
      if (inv.due_date && (!entry.minDue || inv.due_date < entry.minDue)) entry.minDue = inv.due_date
      debtorMap.set(inv.customer_id, entry)
    }
    if (bal > 0 && inv.due_date && new Date(inv.due_date).getTime() < overdueCutoff.getTime()) {
      overdueAmount += bal
      overdueCount++
    }
  }

  const topDebtorRows = Array.from(debtorMap.entries())
    .filter(([, d]) => d.sum > 0)
    .sort((a, b) => b[1].sum - a[1].sum)
    .slice(0, 5)
  const debtorCustomerIds = topDebtorRows.map(([id]) => id)

  const [debtorCustomers, lastPayments] = await Promise.all([
    debtorCustomerIds.length
      ? prisma.customer.findMany({ where: { id: { in: debtorCustomerIds } }, select: { id: true, company_name: true } })
      : Promise.resolve([] as { id: string; company_name: string | null }[]),
    debtorCustomerIds.length
      ? prisma.payment.groupBy({ by: ['customer_id'], where: { payment_type: 'Customer Receipt', customer_id: { in: debtorCustomerIds } }, _max: { payment_date: true } })
      : Promise.resolve([] as { customer_id: string | null; _max: { payment_date: string | null } }[]),
  ])
  const debtorNameMap = Object.fromEntries(debtorCustomers.map((c) => [c.id, c.company_name]))
  const lastPaymentMap = Object.fromEntries(lastPayments.map((p) => [p.customer_id, p._max.payment_date]))
  const topDebtors = topDebtorRows.map(([customerId, d]) => ({
    name: debtorNameMap[customerId] || 'Unknown',
    outstandingBal: d.sum,
    daysOverdue: d.minDue ? Math.max(0, Math.floor((now.getTime() - new Date(d.minDue).getTime()) / 86_400_000)) : 0,
    lastPayment: lastPaymentMap[customerId] ? new Date(lastPaymentMap[customerId]!).toISOString() : null,
  }))

  let totalCollected = 0
  const chartReceipts: { date: Date; amount: number }[] = []
  const recentTransactions: { id: string; date: string; type: string; reference: string; amount: number; entity: string; currency: string }[] = []
  const receiptCustomerIds = new Set<string>()
  customerReceipts.forEach((r) => { if (r.customer_id) receiptCustomerIds.add(r.customer_id) })
  dueSoonList.forEach((d) => { if (d.customerId) receiptCustomerIds.add(d.customerId) })
  const customers = receiptCustomerIds.size
    ? await prisma.customer.findMany({ where: { id: { in: Array.from(receiptCustomerIds) } }, select: { id: true, company_name: true } })
    : []
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c.company_name]))

  customerReceipts.forEach((r) => {
    if (!r.payment_date) return
    const val = amt(r.amount, r.currency)
    if (val === null) return
    if (new Date(r.payment_date) >= fiscalStart) totalCollected += val
    chartReceipts.push({ date: new Date(r.payment_date), amount: val })
    if (recentTransactions.length < 8) {
      recentTransactions.push({
        id: r.id,
        date: new Date(r.payment_date).toISOString(),
        type: 'Receipt',
        reference: r.payment_number || '',
        amount: val,
        entity: (r.customer_id && customerMap[r.customer_id]) || 'Unknown',
        currency: r.currency || reportingCurrency,
      })
    }
  })

  let totalExpenses = 0
  otherPayments.forEach((p) => {
    if (!p.payment_date || new Date(p.payment_date) < fiscalStart) return
    const val = amt(p.amount, p.currency)
    if (val !== null) totalExpenses += val
  })

  let cashInBank = 0
  const bankBalances: { bankName: string; accountNumber: string; balance: number; currency: string }[] = []
  bankAccounts.forEach((b) => {
    const val = amt(b.current_balance, b.currency)
    if (val === null) return
    cashInBank += val
    bankBalances.push({ bankName: b.bank_name || '', accountNumber: b.account_number || '', balance: val, currency: b.currency || reportingCurrency })
  })

  return NextResponse.json({
    reportingCurrency,
    viewCurrency,
    availableCurrencies,
    excludedCount: isNative ? 0 : excludedCount,
    totalRevenue,
    totalCollected,
    outstandingReceivables,
    totalExpenses,
    netProfit: totalCollected - totalExpenses,
    cashInBank,
    overdueCount,
    overdueAmount,
    unpaidSuppliers: isNative ? 0 : Number(unpaidSuppliersAgg?._sum.balanceDue ?? 0),
    lowInventoryCount,
    lastPayroll: lastPayroll ? {
      totalNet: Number(lastPayroll.totalNet),
      period: `${lastPayroll.periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    } : null,
    monthlyChart: buildMonthlyChart(chartReceipts),
    bankBalances,
    topDebtors,
    invoicesDueSoon: dueSoonList
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 10)
      .map((i) => ({
        invoiceNumber: i.invoiceNumber,
        customerName: customerMap[i.customerId ?? ''] ?? 'Unknown',
        dueDate: i.dueDate,
        balanceDue: i.balanceDue,
      })),
    recentTransactions,
  })
}
