import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
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

export function timeAgo(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function getIpAddress(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export function paginate(
  page: number,
  limit = 25
): { skip: number; take: number } {
  const safePage = Math.max(1, page)
  return {
    skip: (safePage - 1) * limit,
    take: limit,
  }
}
