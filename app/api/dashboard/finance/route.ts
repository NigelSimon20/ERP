import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

function monthKey(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function buildMonthlyChart(
  receipts: { receiptDate: Date; amount: unknown }[]
) {
  const buckets: { month: string; revenue: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    buckets.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), revenue: 0, expenses: 0 })
  }
  receipts.forEach(r => {
    const b = buckets.find(b => b.month === monthKey(r.receiptDate))
    if (b) b.revenue += Number(r.amount)
  })
  return buckets
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const fiscalStart = new Date(now.getFullYear(), 0, 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000)

  const [
    revenueAgg, collectedAgg, outstandingAgg,
    overdueAgg, overdueCount, unpaidSuppliersAgg,
    lastPayroll, rawReceipts, bankAccounts,
    invoicesDueSoon, recentReceipts,
    lowInventoryCount, paymentsAgg, debtorAgg,
  ] = await Promise.all([
    prisma.salesInvoice.aggregate({ where: { companyId, status: { not: 'VOID' } }, _sum: { total_amount: true } }),
    prisma.payment.aggregate({ where: { companyId, payment_type: 'Customer Receipt', payment_date: { gte: fiscalStart.toISOString().split('T')[0] } }, _sum: { amount: true } }),
    prisma.salesInvoice.aggregate({ where: { companyId, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } }, _sum: { balance_due: true } }),
    prisma.salesInvoice.aggregate({ where: { companyId, status: 'OVERDUE' }, _sum: { balance_due: true } }),
    prisma.salesInvoice.count({ where: { companyId, status: 'OVERDUE' } }),
    prisma.purchaseInvoice.aggregate({ where: { companyId, status: { not: 'PAID' } }, _sum: { balanceDue: true } }),
    prisma.payrollRun.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { totalNet: true, periodStart: true, periodEnd: true } }),
    prisma.payment.findMany({ where: { companyId, payment_type: 'Customer Receipt', payment_date: { gte: sixMonthsAgo.toISOString().split('T')[0] } }, select: { payment_date: true, amount: true }, take: 100 }),
    prisma.bankAccount.findMany({ where: { companyId }, select: { id: true, bank_name: true, account_number: true, current_balance: true }, take: 10 }),
    prisma.salesInvoice.findMany({
      where: { companyId, status: { in: ['UNPAID', 'PARTIAL'] }, due_date: { lte: sevenDaysOut.toISOString() } },
      orderBy: { due_date: 'asc' },
      take: 10,
      select: { invoice_number: true, due_date: true, balance_due: true, customer_id: true },
    }),
    prisma.payment.findMany({ where: { companyId, payment_type: 'Customer Receipt' }, orderBy: { payment_date: 'desc' }, take: 8, select: { id: true, payment_date: true, payment_number: true, amount: true, customer_id: true } }),
    prisma.inventoryItem.count({ where: { companyId } }),
    prisma.payment.aggregate({ where: { companyId, payment_type: { not: 'Customer Receipt' }, payment_date: { gte: fiscalStart.toISOString().split('T')[0] } }, _sum: { amount: true } }),
    prisma.salesInvoice.groupBy({
      by: ['customer_id'],
      where: { companyId, status: { notIn: ['VOID', 'PAID'] } },
      _sum: { balance_due: true },
      _min: { due_date: true },
    }),
  ])

  const topDebtorRows = debtorAgg
    .filter((d) => d.customer_id && Number(d._sum.balance_due ?? 0) > 0)
    .sort((a, b) => Number(b._sum.balance_due ?? 0) - Number(a._sum.balance_due ?? 0))
    .slice(0, 5)
  const debtorCustomerIds = topDebtorRows.map((d) => d.customer_id as string)
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
  const topDebtors = topDebtorRows.map((d) => {
    const dueDate = d._min.due_date
    const daysOverdue = dueDate ? Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000)) : 0
    const lastPaymentDate = lastPaymentMap[d.customer_id as string]
    return {
      name: debtorNameMap[d.customer_id as string] || 'Unknown',
      outstandingBal: Number(d._sum.balance_due ?? 0),
      daysOverdue,
      lastPayment: lastPaymentDate ? new Date(lastPaymentDate).toISOString() : null,
    }
  })

  // Enrich invoicesDueSoon and recentTransactions with customer names
  const customerIds = Array.from(new Set([
    ...invoicesDueSoon.map(i => i.customer_id),
    ...recentReceipts.map(r => r.customer_id),
  ].filter(Boolean) as string[]))
  const customers = customerIds.length > 0
    ? await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, company_name: true } })
    : []
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c.company_name]))

  const totalCollected = Number(collectedAgg._sum.amount ?? 0)
  const totalExpenses  = Number(paymentsAgg._sum.amount ?? 0)
  const cashInBank     = bankAccounts.reduce((sum, b) => sum + Number(b.current_balance ?? 0), 0)

  const recentTransactions = [
    ...recentReceipts.map(r => ({
      id: r.id,
      date: new Date(r.payment_date!).toISOString(),
      type: 'Receipt',
      reference: r.payment_number,
      amount: Number(r.amount),
      entity: (r.customer_id && customerMap[r.customer_id]) || 'Unknown',
    })),
  ].slice(0, 8)

  return NextResponse.json({
    totalRevenue:           Number(revenueAgg._sum.total_amount ?? 0),
    totalCollected,
    outstandingReceivables: Number(outstandingAgg._sum.balance_due ?? 0),
    totalExpenses,
    netProfit:              totalCollected - totalExpenses,
    cashInBank,
    overdueCount,
    overdueAmount:          Number(overdueAgg._sum.balance_due ?? 0),
    unpaidSuppliers:        Number(unpaidSuppliersAgg._sum.balanceDue ?? 0),
    lowInventoryCount,
    lastPayroll: lastPayroll ? {
      totalNet: Number(lastPayroll.totalNet),
      period:   `${lastPayroll.periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    } : null,
    monthlyChart:  buildMonthlyChart(rawReceipts.map(r => ({ receiptDate: new Date(r.payment_date!), amount: r.amount }))),
    bankBalances:  bankAccounts.map(b => ({ bankName: b.bank_name || '', accountNumber: b.account_number || '', balance: Number(b.current_balance ?? 0) })),
    topDebtors,
    invoicesDueSoon: invoicesDueSoon.map(i => ({
      invoiceNumber: i.invoice_number || '',
      customerName:  customerMap[i.customer_id ?? ''] ?? 'Unknown',
      dueDate:       i.due_date || new Date().toISOString(),
      balanceDue:    Number(i.balance_due ?? 0),
    })),
    recentTransactions,
  })
}
