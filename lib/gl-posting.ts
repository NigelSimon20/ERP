import { Prisma } from '@prisma/client'
import crypto from 'crypto'

const NORMAL_DEBIT = ['ASSET', 'EXPENSE']

export async function applyBalanceDeltas(
  tx: Prisma.TransactionClient,
  lines: { accountId: string; debit: number; credit: number }[],
) {
  const accounts = await tx.chartOfAccount.findMany({
    where: { id: { in: lines.map((l) => l.accountId) } },
    select: { id: true, account_type: true },
  })
  const typeById = new Map(accounts.map((a) => [a.id, a.account_type]))

  // Each line is an atomic `increment` at the DB level, so it's safe to fire
  // these concurrently instead of one round trip at a time — this loop was
  // previously sequential and, combined with the rest of the invoice-posting
  // transaction, was the main contributor to interactive transactions
  // exceeding Prisma's default 5s timeout against the Supabase pooler.
  await Promise.all(lines.map((l) => {
    const normalDebit = NORMAL_DEBIT.includes(typeById.get(l.accountId) ?? 'ASSET')
    const delta = normalDebit ? l.debit - l.credit : l.credit - l.debit
    return tx.chartOfAccount.update({ where: { id: l.accountId }, data: { current_balance: { increment: delta } } }).catch(() => {})
  }))
}

/**
 * Voids the journal entry a sales/purchase invoice was posted under and
 * reverses its balance impact — invoices post to the GL on creation now, so
 * voiding one must undo that or the books stay permanently wrong (revenue/AR
 * or expense/AP left standing for an invoice that no longer counts).
 */
export async function reverseJournalEntry(tx: Prisma.TransactionClient, journalEntryId: string) {
  const entry = await tx.journalEntry.findUnique({ where: { id: journalEntryId } })
  if (!entry || entry.status === 'VOID') return

  const lines = await tx.journalLine.findMany({ where: { journalEntryId } })
  await applyBalanceDeltas(tx, lines.map((l) => ({ accountId: l.accountId, debit: Number(l.credit), credit: Number(l.debit) }))) // swap debit/credit to reverse
  await tx.journalEntry.update({ where: { id: journalEntryId }, data: { status: 'VOID', updated_date: new Date().toISOString() } })
}

/**
 * Posts a sales invoice to the GL: Debit Accounts Receivable for the full
 * total, Credit the invoice's revenue account for the subtotal, and Credit
 * VAT/Output Tax for the tax portion (if any and if such an account exists).
 * Invoices previously never posted to the GL at all — only payments against
 * them did — so revenue never appeared on the Income Statement until (and
 * unless) a payment happened to be recorded.
 */
export async function postSalesInvoiceToGL(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string
    invoiceId: string
    invoiceNumber: string
    entryDate: string
    subtotal: number
    taxAmount: number
    totalAmount: number
    receivablesAccountId: string
    revenueAccountId: string
    vatAccountId: string | null
    userId: string
  },
): Promise<string | null> {
  const { companyId, invoiceId, invoiceNumber, entryDate, subtotal, taxAmount, totalAmount, receivablesAccountId, revenueAccountId, vatAccountId, userId } = params
  if (totalAmount <= 0) return null

  const journalId = crypto.randomUUID()
  const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
    { accountId: receivablesAccountId, debit: totalAmount, credit: 0, description: `Invoice ${invoiceNumber}` },
    { accountId: revenueAccountId, debit: 0, credit: subtotal, description: `Invoice ${invoiceNumber}` },
  ]
  if (taxAmount > 0 && vatAccountId) {
    lines.push({ accountId: vatAccountId, debit: 0, credit: taxAmount, description: `Invoice ${invoiceNumber} — VAT` })
  } else if (taxAmount > 0) {
    // No VAT account configured — fold tax into revenue rather than drop it
    // and leave the entry unbalanced.
    lines[1].credit += taxAmount
  }

  await tx.journalEntry.create({
    data: {
      id: journalId, companyId,
      reference: `JE-auto-INV-${invoiceNumber}`,
      entry_date: entryDate,
      description: `Sales invoice ${invoiceNumber}`,
      total_debit: totalAmount,
      total_credit: totalAmount,
      status: 'POSTED',
      created_by_id: userId,
    },
  })
  await tx.journalLine.createMany({
    data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: journalId, ...l })),
  })
  await applyBalanceDeltas(tx, lines)
  await tx.salesInvoice.update({ where: { id: invoiceId }, data: { journal_entry_id: journalId, revenue_account_id: revenueAccountId, receivables_account_id: receivablesAccountId } }).catch(() => {})

  return journalId
}

/**
 * Posts a purchase invoice to the GL: Debit the chosen expense account for
 * the full total, Credit Accounts Payable. Same missing-GL-posting bug as
 * sales invoices, mirrored on the AP side.
 */
export async function postPurchaseInvoiceToGL(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string
    invoiceId: string
    invoiceNumber: string
    entryDate: string
    totalAmount: number
    payableAccountId: string
    expenseAccountId: string
    userId: string
  },
): Promise<string | null> {
  const { companyId, invoiceId, invoiceNumber, entryDate, totalAmount, payableAccountId, expenseAccountId, userId } = params
  if (totalAmount <= 0) return null

  const journalId = crypto.randomUUID()
  const lines = [
    { accountId: expenseAccountId, description: `Bill ${invoiceNumber}`, debit: totalAmount, credit: 0 },
    { accountId: payableAccountId, description: `Bill ${invoiceNumber}`, debit: 0, credit: totalAmount },
  ]

  await tx.journalEntry.create({
    data: {
      id: journalId, companyId,
      reference: `JE-auto-BILL-${invoiceNumber}`,
      entry_date: entryDate,
      description: `Purchase invoice ${invoiceNumber}`,
      total_debit: totalAmount,
      total_credit: totalAmount,
      status: 'POSTED',
      created_by_id: userId,
    },
  })
  await tx.journalLine.createMany({
    data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: journalId, ...l })),
  })
  await applyBalanceDeltas(tx, lines)
  await tx.purchaseInvoice.update({ where: { id: invoiceId }, data: { journalEntryId: journalId } }).catch(() => {})

  return journalId
}

/**
 * Posts an issued Credit Note to the GL: the mirror-reverse of
 * postSalesInvoiceToGL — Debit Revenue (and VAT, if applicable) for the
 * amount being credited back, Credit Accounts Receivable, since the note
 * reduces what the customer owes.
 */
export async function postCreditNoteToGL(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string
    creditNoteId: string
    creditNoteNumber: string
    entryDate: string
    subtotal: number
    taxAmount: number
    totalAmount: number
    receivablesAccountId: string
    revenueAccountId: string
    vatAccountId: string | null
    userId: string
  },
): Promise<string | null> {
  const { companyId, creditNoteId, creditNoteNumber, entryDate, subtotal, taxAmount, totalAmount, receivablesAccountId, revenueAccountId, vatAccountId, userId } = params
  if (totalAmount <= 0) return null

  const journalId = crypto.randomUUID()
  const lines: { accountId: string; debit: number; credit: number; description: string }[] = [
    { accountId: revenueAccountId, debit: subtotal, credit: 0, description: `Credit Note ${creditNoteNumber}` },
    { accountId: receivablesAccountId, debit: 0, credit: totalAmount, description: `Credit Note ${creditNoteNumber}` },
  ]
  if (taxAmount > 0 && vatAccountId) {
    lines.push({ accountId: vatAccountId, debit: taxAmount, credit: 0, description: `Credit Note ${creditNoteNumber} — VAT` })
  } else if (taxAmount > 0) {
    lines[0].debit += taxAmount
  }

  await tx.journalEntry.create({
    data: {
      id: journalId, companyId,
      reference: `JE-auto-CRN-${creditNoteNumber}`,
      entry_date: entryDate,
      description: `Credit note ${creditNoteNumber}`,
      total_debit: totalAmount,
      total_credit: totalAmount,
      status: 'POSTED',
      created_by_id: userId,
    },
  })
  await tx.journalLine.createMany({
    data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: journalId, ...l })),
  })
  await applyBalanceDeltas(tx, lines)
  await tx.creditNote.update({ where: { id: creditNoteId }, data: { journalEntryId: journalId } }).catch(() => {})

  return journalId
}

/**
 * Posts an issued Debit Note to the GL: the mirror-reverse of
 * postPurchaseInvoiceToGL — Debit Accounts Payable, Credit the expense
 * account, since the note reduces what's owed to the supplier.
 */
export async function postDebitNoteToGL(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string
    debitNoteId: string
    debitNoteNumber: string
    entryDate: string
    totalAmount: number
    payableAccountId: string
    expenseAccountId: string
    userId: string
  },
): Promise<string | null> {
  const { companyId, debitNoteId, debitNoteNumber, entryDate, totalAmount, payableAccountId, expenseAccountId, userId } = params
  if (totalAmount <= 0) return null

  const journalId = crypto.randomUUID()
  const lines = [
    { accountId: payableAccountId, description: `Debit Note ${debitNoteNumber}`, debit: totalAmount, credit: 0 },
    { accountId: expenseAccountId, description: `Debit Note ${debitNoteNumber}`, debit: 0, credit: totalAmount },
  ]

  await tx.journalEntry.create({
    data: {
      id: journalId, companyId,
      reference: `JE-auto-DBN-${debitNoteNumber}`,
      entry_date: entryDate,
      description: `Debit note ${debitNoteNumber}`,
      total_debit: totalAmount,
      total_credit: totalAmount,
      status: 'POSTED',
      created_by_id: userId,
    },
  })
  await tx.journalLine.createMany({
    data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: journalId, ...l })),
  })
  await applyBalanceDeltas(tx, lines)
  await tx.debitNote.update({ where: { id: debitNoteId }, data: { journalEntryId: journalId } }).catch(() => {})

  return journalId
}

/**
 * Posts a paid Expense Claim to the GL: Debit the expense category's account,
 * Credit the bank account it was paid from. Only reachable once a claim is
 * marked PAID (approval alone doesn't move cash or hit the books).
 */
export async function postExpenseClaimToGL(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string
    expenseClaimId: string
    claimNumber: string
    entryDate: string
    amount: number
    expenseAccountId: string
    bankAccountId: string
    userId: string
  },
): Promise<string | null> {
  const { companyId, expenseClaimId, claimNumber, entryDate, amount, expenseAccountId, bankAccountId, userId } = params
  if (amount <= 0) return null

  const journalId = crypto.randomUUID()
  const lines = [
    { accountId: expenseAccountId, description: `Expense Claim ${claimNumber}`, debit: amount, credit: 0 },
    { accountId: bankAccountId, description: `Expense Claim ${claimNumber}`, debit: 0, credit: amount },
  ]

  await tx.journalEntry.create({
    data: {
      id: journalId, companyId,
      reference: `JE-auto-EXP-${claimNumber}`,
      entry_date: entryDate,
      description: `Expense claim ${claimNumber}`,
      total_debit: amount,
      total_credit: amount,
      status: 'POSTED',
      created_by_id: userId,
    },
  })
  await tx.journalLine.createMany({
    data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: journalId, ...l })),
  })
  await applyBalanceDeltas(tx, lines)
  await tx.expenseClaim.update({ where: { id: expenseClaimId }, data: { journalEntryId: journalId } }).catch(() => {})

  return journalId
}
