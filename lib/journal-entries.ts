import type { JournalEntry, Prisma } from '@prisma/client'

export interface JournalEntryDto {
  id: string
  reference: string
  date: string | null
  description: string
  status: string
  totalDebit: number
  totalCredit: number
}

// Imported (Base44) rows keep the number in entry_number and may have no
// reference; app-created rows set both.
export function toJournalEntryDto(
  e: JournalEntry,
  sums?: { debit: Prisma.Decimal | null; credit: Prisma.Decimal | null },
): JournalEntryDto {
  return {
    id: e.id,
    reference: e.reference || e.entry_number || '—',
    date: e.entry_date ?? null,
    description: e.description ?? '',
    status: e.status ?? 'DRAFT',
    totalDebit: Number(sums?.debit ?? 0),
    totalCredit: Number(sums?.credit ?? 0),
  }
}
