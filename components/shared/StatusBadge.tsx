'use client'

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAID: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-green-100 text-green-800',
  PRESENT: 'bg-green-100 text-green-800',
  APPROVED: 'bg-green-100 text-green-800',
  POSTED: 'bg-green-100 text-green-800',
  FULFILLED: 'bg-green-100 text-green-800',
  RECONCILED: 'bg-green-100 text-green-800',
  WON: 'bg-green-100 text-green-800',
  PASSED: 'bg-green-100 text-green-800',
  ATTENDED: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-amber-100 text-amber-800',
  UNPAID: 'bg-amber-100 text-amber-800',
  SCHEDULED: 'bg-amber-100 text-amber-800',
  IN_REVIEW: 'bg-amber-100 text-amber-800',
  NEW: 'bg-amber-100 text-amber-800',
  CONTACTED: 'bg-amber-100 text-amber-800',
  HALF_DAY: 'bg-amber-100 text-amber-800',
  DELAYED: 'bg-amber-100 text-amber-800',
  REPAIR: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-blue-100 text-blue-800',
  INVESTIGATING: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-blue-100 text-blue-800',
  PROPOSAL_SENT: 'bg-blue-100 text-blue-800',
  NEGOTIATION: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CRITICAL: 'bg-red-100 text-red-800',
  TERMINATED: 'bg-red-100 text-red-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  LOST: 'bg-red-100 text-red-800',
  FAILED: 'bg-red-100 text-red-800',
  OPEN: 'bg-red-100 text-red-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
  VOID: 'bg-gray-100 text-gray-600',
  MISSED: 'bg-gray-100 text-gray-600',
  RETIRED: 'bg-gray-100 text-gray-600',
  DISPOSED: 'bg-gray-100 text-gray-600',
  EXPIRED: 'bg-gray-100 text-gray-600',
  ABSENT: 'bg-gray-100 text-gray-600',
  CLOSED: 'bg-gray-100 text-gray-600',
  REGISTERED: 'bg-gray-100 text-gray-600',
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = status?.toString() ?? ''
  const style = STATUS_STYLES[normalized.toUpperCase()] ?? 'bg-gray-100 text-gray-600'
  const label = normalized.replace(/_/g, ' ') || '—'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
