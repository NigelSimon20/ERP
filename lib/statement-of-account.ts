import { Prisma, PrismaClient } from '@prisma/client'
import { round2dp } from './calculations'

type Db = PrismaClient | Prisma.TransactionClient

export interface StatementLine { date: string; type: string; reference: string; description: string; charge: number; payment: number; runningBalance: number }
export interface StatementOfAccountResult { partyId: string; partyName: string; openingBalance: number; closingBalance: number; lines: StatementLine[] }

// Customer statement: SalesInvoices (charges) less Receipts and issued Credit
// Notes (payments/reductions), ordered by date with a running balance —
// the same three record types that already feed
// recalculateCustomerOutstandingBalance's total, just itemized over time
// instead of collapsed into a single number.
export async function computeCustomerStatement(db: Db, companyId: string, customerId: string, from: Date, to: Date): Promise<StatementOfAccountResult> {
  const customer = await db.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true, company_name: true } })

  const [invoices, receipts, creditNotes] = await Promise.all([
    db.salesInvoice.findMany({ where: { customer_id: customerId, companyId, status: { not: 'VOID' } }, select: { invoice_number: true, invoice_date: true, total_amount: true } }),
    db.receipt.findMany({ where: { customerId, companyId } }),
    db.creditNote.findMany({ where: { customerId, companyId, status: 'ISSUED' } }),
  ])

  const events = [
    ...invoices.map((i) => ({ date: i.invoice_date ?? '', type: 'Invoice', reference: i.invoice_number ?? '', description: `Sales invoice ${i.invoice_number ?? ''}`, charge: Number(i.total_amount ?? 0), payment: 0 })),
    ...receipts.map((r) => ({ date: r.receiptDate.toISOString(), type: 'Receipt', reference: r.reference, description: `Receipt ${r.reference}`, charge: 0, payment: Number(r.amount) })),
    ...creditNotes.map((c) => ({ date: c.issueDate.toISOString(), type: 'Credit Note', reference: c.creditNoteNumber, description: `Credit note ${c.creditNoteNumber} — ${c.reason}`, charge: 0, payment: Number(c.totalAmount) })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let openingBalance = 0
  const periodLines: StatementLine[] = []
  for (const e of events) {
    const d = new Date(e.date)
    if (d < from) {
      openingBalance += e.charge - e.payment
    } else if (d <= to) {
      periodLines.push({ ...e, runningBalance: 0 })
    }
  }

  let running = round2dp(openingBalance)
  for (const line of periodLines) {
    running = round2dp(running + line.charge - line.payment)
    line.runningBalance = running
  }

  return { partyId: customerId, partyName: customer?.company_name ?? '', openingBalance: round2dp(openingBalance), closingBalance: running, lines: periodLines }
}

// Supplier statement: PurchaseInvoices (charges) less outgoing Payments and
// issued Debit Notes (payments/reductions) — mirrors computeCustomerStatement
// on the payables side.
export async function computeSupplierStatement(db: Db, companyId: string, supplierId: string, from: Date, to: Date): Promise<StatementOfAccountResult> {
  const supplier = await db.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true, company_name: true } })

  const [bills, payments, debitNotes] = await Promise.all([
    db.purchaseInvoice.findMany({ where: { supplierId, companyId, status: { not: 'VOID' } as any }, select: { invoiceNumber: true, issueDate: true, totalAmount: true } }),
    db.payment.findMany({ where: { supplier_id: supplierId, companyId, payment_type: { in: ['Supplier Payment'] } } }),
    db.debitNote.findMany({ where: { supplierId, companyId, status: 'ISSUED' } }),
  ])

  const events = [
    ...bills.map((b) => ({ date: b.issueDate.toISOString(), type: 'Bill', reference: b.invoiceNumber, description: `Purchase invoice ${b.invoiceNumber}`, charge: Number(b.totalAmount), payment: 0 })),
    ...payments.map((p) => ({ date: p.payment_date ?? '', type: 'Payment', reference: p.payment_number ?? '', description: `Payment ${p.payment_number ?? ''}`, charge: 0, payment: Number(p.amount ?? 0) })),
    ...debitNotes.map((d) => ({ date: d.issueDate.toISOString(), type: 'Debit Note', reference: d.debitNoteNumber, description: `Debit note ${d.debitNoteNumber} — ${d.reason}`, charge: 0, payment: Number(d.totalAmount) })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let openingBalance = 0
  const periodLines: StatementLine[] = []
  for (const e of events) {
    const d = new Date(e.date)
    if (d < from) {
      openingBalance += e.charge - e.payment
    } else if (d <= to) {
      periodLines.push({ ...e, runningBalance: 0 })
    }
  }

  let running = round2dp(openingBalance)
  for (const line of periodLines) {
    running = round2dp(running + line.charge - line.payment)
    line.runningBalance = running
  }

  return { partyId: supplierId, partyName: supplier?.company_name ?? '', openingBalance: round2dp(openingBalance), closingBalance: running, lines: periodLines }
}
