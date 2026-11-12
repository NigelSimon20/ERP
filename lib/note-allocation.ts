import { Prisma, type InvoiceStatus } from '@prisma/client'
import { ApiError } from './api-error'
import { money } from './money'
import { determineInvoiceStatus } from './calculations'
import { toDbInvoiceStatus, DB_STATUS_VOID } from './invoice-status'

type Tx = Prisma.TransactionClient
const D = Prisma.Decimal

// A2: a credit note reduces its sales invoice, and a debit note its bill, in
// the same transaction that posts the note's journal. The amount applied is
// stored on both sides (invoice credited_amount, note allocatedAmount), so a
// void reverses exactly what was applied. Whatever is not applied stays as
// unapplied credit, which the subledgers count against the customer/supplier.
//
// A note larger than the document's remaining balance is rejected, unless the
// company allows the excess to remain as unapplied credit.

function exceeds(kind: string, amount: Prisma.Decimal, balance: Prisma.Decimal) {
  return new ApiError(
    `This ${kind} (${amount.toFixed(2)}) is more than the remaining balance (${balance.toFixed(2)}). Reduce it, or allow unapplied credit in Settings.`,
    400, 'CREDIT_EXCEEDS_BALANCE',
  )
}

export async function applyCreditNoteToInvoice(tx: Tx, note: { id: string; companyId: string; salesInvoiceId: string | null; totalAmount: Prisma.Decimal | number }, allowUnapplied: boolean) {
  if (!note.salesInvoiceId) return new D(0)
  const [inv] = await tx.$queryRaw<{ total_amount: Prisma.Decimal | null; amount_paid: Prisma.Decimal | null; credited_amount: Prisma.Decimal; due_date: string | null; status: string | null }[]>`
    SELECT total_amount, amount_paid, credited_amount, due_date, status FROM sales_invoices
    WHERE id = ${note.salesInvoiceId} AND "companyId" = ${note.companyId} FOR UPDATE`
  if (!inv) throw new ApiError('The invoice this credit note is for no longer exists', 400, 'INVALID_REFERENCE')
  if (inv.status === DB_STATUS_VOID) throw new ApiError('The invoice this credit note is for has been voided', 409, 'INVALID_STATE')
  const total = money(inv.total_amount), paid = money(inv.amount_paid), credited = money(inv.credited_amount)
  const balance = total.sub(paid).sub(credited)
  const amount = money(note.totalAmount)
  let applied = amount
  if (amount.gt(balance)) {
    if (!allowUnapplied) throw exceeds('credit note', amount, balance)
    applied = balance.isPositive() ? balance : new D(0)
  }
  await setInvoiceCredit(tx, note.salesInvoiceId, total, paid, credited.add(applied), inv.due_date)
  await tx.creditNote.update({ where: { id: note.id }, data: { allocatedAmount: applied } })
  return applied
}

export async function reverseCreditNoteAllocation(tx: Tx, note: { id: string; companyId: string; salesInvoiceId: string | null }) {
  const [cn] = await tx.$queryRaw<{ allocatedAmount: Prisma.Decimal }[]>`SELECT "allocatedAmount" FROM credit_notes WHERE id = ${note.id} FOR UPDATE`
  const allocated = money(cn?.allocatedAmount ?? 0)
  if (!note.salesInvoiceId || allocated.isZero()) return
  const [inv] = await tx.$queryRaw<{ total_amount: Prisma.Decimal | null; amount_paid: Prisma.Decimal | null; credited_amount: Prisma.Decimal; due_date: string | null }[]>`
    SELECT total_amount, amount_paid, credited_amount, due_date FROM sales_invoices
    WHERE id = ${note.salesInvoiceId} AND "companyId" = ${note.companyId} FOR UPDATE`
  if (inv) await setInvoiceCredit(tx, note.salesInvoiceId, money(inv.total_amount), money(inv.amount_paid), money(inv.credited_amount).sub(allocated), inv.due_date)
  await tx.creditNote.update({ where: { id: note.id }, data: { allocatedAmount: 0 } })
}

async function setInvoiceCredit(tx: Tx, id: string, total: Prisma.Decimal, paid: Prisma.Decimal, credited: Prisma.Decimal, dueDate: string | null) {
  const settled = paid.add(credited)
  await tx.salesInvoice.update({
    where: { id },
    data: {
      credited_amount: credited,
      balance_due: total.sub(settled),
      status: toDbInvoiceStatus(determineInvoiceStatus(Number(total), Number(settled), new Date(dueDate ?? Date.now()))),
      updated_date: new Date().toISOString(),
    },
  })
}

export async function applyDebitNoteToBill(tx: Tx, note: { id: string; companyId: string; purchaseInvoiceId: string | null; totalAmount: Prisma.Decimal | number }, allowUnapplied: boolean) {
  if (!note.purchaseInvoiceId) return new D(0)
  const [bill] = await tx.$queryRaw<{ totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal | null; creditedAmount: Prisma.Decimal; dueDate: Date; status: string }[]>`
    SELECT "totalAmount", "paidAmount", "creditedAmount", "dueDate", status::text AS status FROM purchase_invoices
    WHERE id = ${note.purchaseInvoiceId} AND "companyId" = ${note.companyId} FOR UPDATE`
  if (!bill) throw new ApiError('The bill this debit note is for no longer exists', 400, 'INVALID_REFERENCE')
  if (bill.status === 'VOID') throw new ApiError('The bill this debit note is for has been voided', 409, 'INVALID_STATE')
  const total = money(bill.totalAmount), paid = money(bill.paidAmount ?? 0), credited = money(bill.creditedAmount)
  const balance = total.sub(paid).sub(credited)
  const amount = money(note.totalAmount)
  let applied = amount
  if (amount.gt(balance)) {
    if (!allowUnapplied) throw exceeds('debit note', amount, balance)
    applied = balance.isPositive() ? balance : new D(0)
  }
  await setBillCredit(tx, note.purchaseInvoiceId, total, paid, credited.add(applied), bill.dueDate)
  await tx.debitNote.update({ where: { id: note.id }, data: { allocatedAmount: applied } })
  return applied
}

export async function reverseDebitNoteAllocation(tx: Tx, note: { id: string; companyId: string; purchaseInvoiceId: string | null }) {
  const [dn] = await tx.$queryRaw<{ allocatedAmount: Prisma.Decimal }[]>`SELECT "allocatedAmount" FROM debit_notes WHERE id = ${note.id} FOR UPDATE`
  const allocated = money(dn?.allocatedAmount ?? 0)
  if (!note.purchaseInvoiceId || allocated.isZero()) return
  const [bill] = await tx.$queryRaw<{ totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal | null; creditedAmount: Prisma.Decimal; dueDate: Date }[]>`
    SELECT "totalAmount", "paidAmount", "creditedAmount", "dueDate" FROM purchase_invoices
    WHERE id = ${note.purchaseInvoiceId} AND "companyId" = ${note.companyId} FOR UPDATE`
  if (bill) await setBillCredit(tx, note.purchaseInvoiceId, money(bill.totalAmount), money(bill.paidAmount ?? 0), money(bill.creditedAmount).sub(allocated), bill.dueDate)
  await tx.debitNote.update({ where: { id: note.id }, data: { allocatedAmount: 0 } })
}

async function setBillCredit(tx: Tx, id: string, total: Prisma.Decimal, paid: Prisma.Decimal, credited: Prisma.Decimal, dueDate: Date) {
  const settled = paid.add(credited)
  await tx.purchaseInvoice.update({
    where: { id },
    data: {
      creditedAmount: credited,
      balanceDue: total.sub(settled),
      status: determineInvoiceStatus(Number(total), Number(settled), new Date(dueDate)) as InvoiceStatus,
    },
  })
}
