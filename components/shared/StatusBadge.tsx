'use client'

const SUCCESS = 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400'
const WARNING = 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
const INFO = 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400'
const DANGER = 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300'
const MUTED = 'bg-muted text-muted-foreground'

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: SUCCESS,
  PAID: SUCCESS,
  COMPLETED: SUCCESS,
  PRESENT: SUCCESS,
  APPROVED: SUCCESS,
  POSTED: SUCCESS,
  FULFILLED: SUCCESS,
  RECONCILED: SUCCESS,
  WON: SUCCESS,
  PASSED: SUCCESS,
  ATTENDED: SUCCESS,
  PENDING: WARNING,
  DRAFT: WARNING,
  UNPAID: WARNING,
  SCHEDULED: WARNING,
  IN_REVIEW: WARNING,
  NEW: WARNING,
  CONTACTED: WARNING,
  HALF_DAY: WARNING,
  DELAYED: WARNING,
  REPAIR: WARNING,
  IN_PROGRESS: INFO,
  PARTIAL: INFO,
  INVESTIGATING: INFO,
  QUALIFIED: INFO,
  PROPOSAL_SENT: INFO,
  NEGOTIATION: INFO,
  OVERDUE: DANGER,
  CRITICAL: DANGER,
  TERMINATED: DANGER,
  SUSPENDED: DANGER,
  REJECTED: DANGER,
  LOST: DANGER,
  FAILED: DANGER,
  OPEN: DANGER,
  INACTIVE: MUTED,
  CANCELLED: MUTED,
  VOID: MUTED,
  MISSED: MUTED,
  RETIRED: MUTED,
  DISPOSED: MUTED,
  EXPIRED: MUTED,
  ABSENT: MUTED,
  CLOSED: MUTED,
  REGISTERED: MUTED,
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = status?.toString() ?? ''
  const style = STATUS_STYLES[normalized.toUpperCase()] ?? MUTED
  const label = normalized.replace(/_/g, ' ') || '—'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
