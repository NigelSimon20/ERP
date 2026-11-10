import { Prisma, PrismaClient } from '@prisma/client'
import { DB_STATUS_VOID } from '@/lib/invoice-status'
import { buildCurrencyConverter } from '@/lib/currency'
import { ledgerBalances } from './ledger'

type Db = PrismaClient | Prisma.TransactionClient
const D = Prisma.Decimal
const ZERO = new D(0)

// P1-4 (BUG-004): one receivables and one payables figure for the whole app.
// Dashboards, the customer list and the AI helpdesk all call these; the
// reconcile check compares them with the AR/AP control accounts.
//
// Computed from document amounts, not stored status or balance columns:
// an invoice marked PAID with money still owing (BUG-009) still counts.

export interface Subledger {
  // Net amount owed (receivables) / owing (payables), reporting currency.
  total: Prisma.Decimal
  open: Prisma.Decimal
  credits: Prisma.Decimal
  byParty: Map<string, Prisma.Decimal>
  openDocuments: number
  unconverted: number
  controlAccountId: string | null
  controlAccountBalance: Prisma.Decimal | null
  // total - control account; zero when the subledger ties out.
  difference: Prisma.Decimal | null
}

function add(map: Map<string, Prisma.Decimal>, key: string | null, v: Prisma.Decimal) {
  if (!key) return
  map.set(key, (map.get(key) ?? ZERO).add(v))
}

async function controlBalance(db: Db, companyId: string, accountId: string | null) {
  if (!accountId) return null
  const rows = await ledgerBalances(db, companyId, { to: new Date() })
  return rows.find((r) => r.id === accountId)?.balance ?? ZERO
}

export async function getReceivables(db: Db, companyId: string): Promise<Subledger> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { currency: true, receivablesAccountId: true } })
  const convert = await buildCurrencyConverter(company?.currency || 'USD', new Date(), db)
  const [invoices, creditNotes] = await Promise.all([
    db.salesInvoice.findMany({
      where: { companyId, status: { not: DB_STATUS_VOID } },
      select: { customer_id: true, total_amount: true, amount_paid: true, currency: true },
    }),
    db.creditNote.findMany({ where: { companyId, status: 'ISSUED' }, select: { customerId: true, totalAmount: true } }),
  ])
  // Receipts not allocated to an invoice still credit AR in the ledger:
  // they are customer credit (P1-5: overpayments are credit, not clamped).
  const unallocated = await db.payment.findMany({
    where: { companyId, payment_type: 'Customer Receipt', status: { not: 'Void' }, OR: [{ allocations: null }, { allocations: '[]' }, { allocations: '' }] },
    select: { customer_id: true, amount: true, currency: true },
  })

  let open = ZERO, credits = ZERO, openDocuments = 0, unconverted = 0
  const byParty = new Map<string, Prisma.Decimal>()
  for (const inv of invoices) {
    const owed = new D(inv.total_amount ?? 0).sub(new D(inv.amount_paid ?? 0))
    if (owed.isZero()) continue
    const c = convert(Number(owed), inv.currency)
    if (!c.converted) unconverted++
    const v = new D(c.amount).toDecimalPlaces(2)
    if (v.isPositive()) { open = open.add(v); openDocuments++ } else credits = credits.add(v.neg())
    add(byParty, inv.customer_id, v)
  }
  // Issued credit notes credit AR in the ledger; they reduce what is owed.
  for (const cn of creditNotes) {
    const v = new D(cn.totalAmount)
    credits = credits.add(v)
    add(byParty, cn.customerId, v.neg())
  }
  for (const p of unallocated) {
    const c = convert(Number(p.amount ?? 0), p.currency)
    if (!c.converted) unconverted++
    const v = new D(c.amount).toDecimalPlaces(2)
    credits = credits.add(v)
    add(byParty, p.customer_id, v.neg())
  }
  const total = open.sub(credits)
  const controlAccountBalance = await controlBalance(db, companyId, company?.receivablesAccountId ?? null)
  return {
    total, open, credits, byParty, openDocuments, unconverted,
    controlAccountId: company?.receivablesAccountId ?? null,
    controlAccountBalance,
    difference: controlAccountBalance ? total.sub(controlAccountBalance) : null,
  }
}

export async function getPayables(db: Db, companyId: string): Promise<Subledger> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { payablesAccountId: true } })
  const [bills, debitNotes] = await Promise.all([
    db.purchaseInvoice.findMany({ where: { companyId, status: { not: 'VOID' } }, select: { supplierId: true, totalAmount: true, paidAmount: true } }),
    db.debitNote.findMany({ where: { companyId, status: 'ISSUED' }, select: { supplierId: true, totalAmount: true } }),
  ])
  let open = ZERO, credits = ZERO, openDocuments = 0
  const byParty = new Map<string, Prisma.Decimal>()
  for (const b of bills) {
    const owed = new D(b.totalAmount).sub(new D(b.paidAmount ?? 0))
    if (owed.isZero()) continue
    if (owed.isPositive()) { open = open.add(owed); openDocuments++ } else credits = credits.add(owed.neg())
    add(byParty, b.supplierId, owed)
  }
  for (const dn of debitNotes) {
    credits = credits.add(new D(dn.totalAmount))
    add(byParty, dn.supplierId, new D(dn.totalAmount).neg())
  }
  const total = open.sub(credits)
  const controlAccountBalance = await controlBalance(db, companyId, company?.payablesAccountId ?? null)
  return {
    total, open, credits, byParty, openDocuments, unconverted: 0,
    controlAccountId: company?.payablesAccountId ?? null,
    controlAccountBalance,
    difference: controlAccountBalance ? total.sub(controlAccountBalance) : null,
  }
}
