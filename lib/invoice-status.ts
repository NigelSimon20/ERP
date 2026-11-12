import { isPastDue } from '@/lib/calculations'

// A9.2: one invoice status vocabulary, UPPERCASE: UNPAID | PARTIAL | PAID |
// OVERDUE | VOID. OVERDUE is never stored (it comes from the due date), so
// the stored values are UNPAID, PARTIAL, PAID and VOID.
//
// Rows imported from the legacy system hold Title-Case values ("Sent",
// "Partial", "Paid", "Void"). Until scripts/remediate/invoice-status.mjs has
// converted them (owner-approved), every query and check accepts both
// spellings, and new writes use the UPPERCASE ones.
const TO_DB: Record<string, string> = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'UNPAID', // overdue is derived from due date, not a stored value
  VOID: 'VOID',
}

export const LEGACY_TO_CANONICAL: Record<string, string> = {
  Sent: 'UNPAID',
  Partial: 'PARTIAL',
  Paid: 'PAID',
  Void: 'VOID',
}

export function toDbInvoiceStatus(uiStatus: string): string {
  return TO_DB[uiStatus] ?? uiStatus
}

// Every stored value (legacy or canonical) that means the given status.
export function storedStatusValues(uiStatus: string): string[] {
  const canonical = TO_DB[uiStatus] ?? uiStatus
  return [canonical, ...Object.keys(LEGACY_TO_CANONICAL).filter((k) => LEGACY_TO_CANONICAL[k] === canonical)]
}

export function fromDbInvoiceStatus(dbStatus: string | null | undefined, dueDate?: string | Date | null, balanceDue?: number): string {
  const mapped = dbStatus ? (LEGACY_TO_CANONICAL[dbStatus] ?? dbStatus.toUpperCase()) : 'UNPAID'
  if (mapped === 'VOID' || mapped === 'PAID') return mapped
  if (dueDate && Number(balanceDue ?? 0) > 0 && isPastDue(dueDate)) return 'OVERDUE'
  return mapped
}

// Stored values that mean "not yet fully paid" (OVERDUE has no stored
// equivalent, so an "overdue" query needs an explicit due_date/balance_due
// condition, not a status match).
export const DB_STATUS_OUTSTANDING = [...storedStatusValues('UNPAID'), ...storedStatusValues('PARTIAL')]
export const DB_STATUS_VOID_VALUES = storedStatusValues('VOID')
// Prisma filter: not voided. (NULL status rows are excluded, as before.)
export const NOT_VOID = { notIn: DB_STATUS_VOID_VALUES }
export function isVoidStatus(status: string | null | undefined): boolean {
  return !!status && DB_STATUS_VOID_VALUES.includes(status)
}

export type InvoiceStatusUi = 'VOID' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UNPAID'

// BUG-009 / BUG-033: status is derived from the amounts, never trusted from
// the stored column (7 invoices were stored as Paid with money owing), and
// always returned in one UPPERCASE vocabulary.
export function deriveInvoiceStatus(inv: {
  total: unknown
  paid: unknown
  // A2: credit notes applied to the invoice settle it like a payment.
  credited?: unknown
  dueDate?: string | Date | null
  voided: boolean
}): InvoiceStatusUi {
  if (inv.voided) return 'VOID'
  const settled = Number(inv.paid ?? 0) + Number(inv.credited ?? 0)
  const owed = Math.round((Number(inv.total ?? 0) - settled) * 100)
  if (owed <= 0) return 'PAID'
  if (inv.dueDate && isPastDue(inv.dueDate)) return 'OVERDUE'
  return settled > 0 ? 'PARTIAL' : 'UNPAID'
}
