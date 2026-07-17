// SalesInvoice.status in the live DB is plain Title-Case text imported from
// the legacy system ("Sent", "Partial", "Paid", "Void" — no "Draft" or
// "Unpaid" ever appears), while the rest of the finance code/UI was written
// assuming SCREAMING_CASE ("UNPAID", "PARTIAL", "PAID", "OVERDUE", "VOID").
// These helpers translate at the API boundary so both sides can keep their
// own convention: the DB keeps its imported values, the UI keeps its enum.
const TO_DB: Record<string, string> = {
  UNPAID: 'Sent',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERDUE: 'Sent', // overdue is derived from due date, not a stored value
  VOID: 'Void',
}

const FROM_DB: Record<string, string> = {
  Sent: 'UNPAID',
  Partial: 'PARTIAL',
  Paid: 'PAID',
  Void: 'VOID',
}

export function toDbInvoiceStatus(uiStatus: string): string {
  return TO_DB[uiStatus] ?? uiStatus
}

export function fromDbInvoiceStatus(dbStatus: string | null | undefined, dueDate?: string | Date | null, balanceDue?: number): string {
  const mapped = dbStatus ? (FROM_DB[dbStatus] ?? dbStatus.toUpperCase()) : 'UNPAID'
  if (mapped === 'VOID' || mapped === 'PAID') return mapped
  if (dueDate && Number(balanceDue ?? 0) > 0 && new Date() > new Date(dueDate)) return 'OVERDUE'
  return mapped
}

// Real stored SalesInvoice.status values that mean "not yet fully paid"
// (OVERDUE has no stored equivalent — it's purely a function of due date,
// see fromDbInvoiceStatus above — so any Prisma query for "overdue" needs an
// explicit due_date/balance_due condition, not a status match).
export const DB_STATUS_OUTSTANDING = ['Sent', 'Partial']
export const DB_STATUS_VOID = 'Void'
