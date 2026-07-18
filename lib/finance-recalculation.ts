import { Prisma } from '@prisma/client'
import { DB_STATUS_VOID } from '@/lib/invoice-status'
import { convertToReportingCurrency } from '@/lib/currency'

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
      where: { customer_id: customerId, status: { not: DB_STATUS_VOID } },
      select: { total_amount: true, amount_paid: true, currency: true, companyId: true },
    }),
    tx.customer.findUnique({ where: { id: customerId }, select: { companyId: true } }),
  ])

  const reportingCurrency = customer
    ? (await tx.company.findUnique({ where: { id: customer.companyId }, select: { currency: true } }))?.currency ?? 'USD'
    : 'USD'

  let outstanding = 0
  for (const invoice of invoices) {
    const total = toNumber(invoice.total_amount)
    const paid = toNumber(invoice.amount_paid)
    const balance = Math.max(0, total - paid)
    outstanding += await convertToReportingCurrency(balance, invoice.currency, reportingCurrency)
  }

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
    select: { totalAmount: true, paidAmount: true },
  })

  const outstanding = bills.reduce((sum, bill) => {
    const total = toNumber(bill.totalAmount)
    const paid = toNumber(bill.paidAmount)
    return sum + Math.max(0, total - paid)
  }, 0)

  await tx.supplier.update({
    where: { id: supplierId },
    data: { current_balance: outstanding },
  })

  return outstanding
}
