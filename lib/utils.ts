import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// BUG-021: callers must pass the record's currency -- ZWG balances were
// rendered with "$" because the USD default was used everywhere.
export function formatCurrency(amount: number, currency: string | null | undefined = 'USD'): string {
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  } catch {
    // Not an ISO 4217 code Intl accepts: show the code rather than throw.
    return `${code} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
  }
}

// date-fns `format` throws RangeError on an invalid date, which takes down
// the whole page for one bad row -- render a placeholder instead.
function safeFormat(date: Date | string | null | undefined, pattern: string): string {
  if (date == null || date === '') return '—'
  const d = new Date(date)
  return isNaN(d.getTime()) ? '—' : format(d, pattern)
}

export function formatDate(date: Date | string | null | undefined): string {
  return safeFormat(date, 'dd MMM yyyy')
}

export function formatDateTime(date: Date | string | null | undefined): string {
  return safeFormat(date, 'dd MMM yyyy HH:mm')
}

export function formatTime(date: Date | string | null | undefined): string {
  return safeFormat(date, 'HH:mm')
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (date == null || date === '') return '—'
  const d = new Date(date)
  return isNaN(d.getTime()) ? '—' : formatDistanceToNow(d, { addSuffix: true })
}

export function getIpAddress(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export const MAX_PAGE_SIZE = 100

export function paginate(
  page: number,
  limit = 25
): { skip: number; take: number } {
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(limit) || 25)))
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  }
}

// `?limit=` for list endpoints, capped at MAX_PAGE_SIZE (P1-7).
export function pageLimit(searchParams: URLSearchParams, fallback = 25): number {
  const n = Number(searchParams.get('limit'))
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_PAGE_SIZE, Math.floor(n)) : fallback
}
