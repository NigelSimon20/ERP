import { prisma } from '@/lib/prisma'
import { coerceMappedRow } from './coerce'
import type { ImportMode, ModuleImportConfig, ValidatedRow } from './types'

export interface ValidateParams {
  companyId: string
  config: ModuleImportConfig
  rows: Record<string, unknown>[]
  /** header (uploaded column name) -> target field key, or null if unmapped */
  mapping: Record<string, string | null>
  mode: ImportMode
}

export async function validateRows(params: ValidateParams): Promise<ValidatedRow[]> {
  const { companyId, config, rows, mapping, mode } = params
  const results: ValidatedRow[] = []
  const seenKeys = new Map<string, number>() // naturalKey -> first rowNumber it appeared on

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]
    const rowNumber = i + 1

    const mapped: Record<string, unknown> = {}
    for (const [header, fieldKey] of Object.entries(mapping)) {
      if (fieldKey) mapped[fieldKey] = raw[header]
    }

    const { data: coerced, errors: coerceErrors } = coerceMappedRow(mapped, config.fields)
    const errors = [...coerceErrors, ...(config.customValidate?.(coerced) ?? [])]

    const naturalKey = config.naturalKeyOf(coerced)
    if (naturalKey) {
      const firstSeenRow = seenKeys.get(naturalKey)
      if (firstSeenRow !== undefined) {
        errors.push(`Duplicate of row ${firstSeenRow} within this file`)
      } else {
        seenKeys.set(naturalKey, rowNumber)
      }
    }

    let existingId: string | undefined
    let classification: ValidatedRow['classification']

    if (errors.length > 0) {
      classification = 'INVALID'
    } else {
      const existing = await config.findExisting(prisma as unknown as Parameters<typeof config.findExisting>[0], companyId, coerced)
      existingId = existing?.id

      if (mode === 'CREATE') {
        classification = existing ? 'DUPLICATE' : 'NEW'
        if (existing) errors.push('A record with this identifier already exists')
      } else if (mode === 'UPDATE') {
        if (!existing) {
          classification = 'INVALID'
          errors.push('No matching existing record found to update')
        } else {
          classification = 'UPDATE'
        }
      } else {
        // UPSERT / PREVIEW_ONLY
        classification = existing ? 'UPDATE' : 'NEW'
      }
    }

    results.push({ rowNumber, rawData: raw, mappedData: coerced, classification, errors, existingId })
  }

  return results
}
