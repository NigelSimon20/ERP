import crypto from 'crypto'

// Chain root for the first entry at a site — an unambiguous, non-guessable
// sentinel distinct from any real SHA-256 digest of actual content.
export const GENESIS_HASH = '0'.repeat(64)

export const OCCURRENCE_ENTRY_TYPES = [
  'SHIFT_START',
  'SHIFT_END',
  'HANDOVER',
  'VISITOR',
  'DELIVERY',
  'PATROL_NOTE',
  'INCIDENT_REF',
  'GENERAL',
] as const

export type OccurrenceEntryType = (typeof OCCURRENCE_ENTRY_TYPES)[number]

interface HashInput {
  siteId: string
  sequenceNumber: number
  entryType: string
  narrative: string
  recordedById: string
  occurredAt: string // ISO 8601
  previousHash: string
}

/** Deterministic content hash for one occurrence entry, chained to the previous entry's hash. */
export function computeEntryHash(input: HashInput): string {
  const canonical = [
    input.siteId,
    input.sequenceNumber,
    input.entryType,
    input.narrative,
    input.recordedById,
    input.occurredAt,
    input.previousHash,
  ].join('|')
  return crypto.createHash('sha256').update(canonical).digest('hex')
}
