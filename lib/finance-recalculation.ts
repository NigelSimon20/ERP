import { Prisma } from '@prisma/client'
import { NOT_VOID } from '@/lib/invoice-status'
import { buildCurrencyConverter } from '@/lib/currency'
import { round2dp } from '@/lib/calculations'

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export async function recalculateCustomerOutstandingBalance(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<number> {
  const [invoices, customer] = await Promise.all([
    tx.salesInvoice.findMany({
      where: { customer_id: customerId, status: NOT_VOID },
      select: { total_amount: true, amount_paid: true, credited_amount: true, currency: true, companyId: true },
    }),
    tx.customer.findUnique({ where: { id: customerId }, select: { companyId: true } }),
  ])

  const reportingCurrency = customer
    ? (await tx.company.findUnique({ where: { id: customer.companyId }, select: { currency: true } }))?.currency ?? 'USD'
    : 'USD'

  // Was calling convertToReportingCurrency (1-2 queries each) per invoice in
  // this loop — for a customer with N invoices that's up to 2N extra
  // round trips held open inside the caller's interactive transaction,
  // which was blowing past Prisma's default 5s transaction timeout on
  // customers with more than a handful of invoices. Load every rate once
  // instead.
  const convert = await buildCurrencyConverter(reportingCurrency, new Date(), tx)
  // Same rule as getReceivables (lib/reports/subledger.ts), so the customer
  // list ties out to the dashboards: overpayments and issued credit notes
  // are credits against what the customer owes, not clamped to zero.
  let outstanding = 0
  for (const invoice of invoices) {
    const total = toNumber(invoice.total_amount)
    const paid = toNumber(invoice.amount_paid) + toNumber(invoice.credited_amount)
    outstanding += round2dp(convert(total - paid, invoice.currency).amount)
  }
  // Only the unapplied part of each credit note (A2: the applied part is
  // already off its invoice).
  const credited = await tx.creditNote.aggregate({ where: { customerId, status: 'ISSUED' }, _sum: { totalAmount: true, allocatedAmount: true } })
  const unallocated = await tx.payment.findMany({
    where: { customer_id: customerId, payment_type: 'Customer Receipt', status: { not: 'Void' }, OR: [{ allocations: null }, { allocations: '[]' }, { allocations: '' }] },
    select: { amount: true, currency: true },
  })
  const unallocatedTotal = unallocated.reduce((s, p) => s + round2dp(convert(toNumber(p.amount), p.currency).amount), 0)
  outstanding = round2dp(outstanding - (toNumber(credited._sum.totalAmount) - toNumber(credited._sum.allocatedAmount)) - unallocatedTotal)

  await tx.customer.update({
    where: { id: customerId },
    data: { current_balance: outstanding },
  })

  return outstanding
}

export async function recalculateSupplierOutstandingBalance(
  tx: Prisma.TransactionClient,
  supplierId: string,
  companyId: string,
): Promise<number> {
  const bills = await tx.purchaseInvoice.findMany({
    where: { supplierId, companyId, status: { not: 'VOID' } },
    select: { totalAmount: true, paidAmount: true, creditedAmount: true },
  })

  // Same rule as getPayables (lib/reports/subledger.ts).
  const debited = await tx.debitNote.aggregate({ where: { supplierId, companyId, status: 'ISSUED' }, _sum: { totalAmount: true, allocatedAmount: true } })
  const outstanding = round2dp(bills.reduce((sum, bill) => sum + toNumber(bill.totalAmount) - toNumber(bill.paidAmount) - toNumber(bill.creditedAmount), 0) - (toNumber(debited._sum.totalAmount) - toNumber(debited._sum.allocatedAmount)))

  await tx.supplier.update({
    where: { id: supplierId },
    data: { current_balance: outstanding },
  })

  return outstanding
}
