import type { FieldSpec } from './types'

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function coerceValue(field: FieldSpec, raw: unknown): { value: unknown; error: string | null } {
  if (isBlank(raw)) return { value: null, error: null }
  const str = String(raw).trim()

  switch (field.type) {
    case 'number': {
      const n = Number(str.replace(/,/g, ''))
      if (Number.isNaN(n)) return { value: null, error: `"${field.label}" must be a number` }
      return { value: n, error: null }
    }
    case 'boolean': {
      const lower = str.toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(lower)) return { value: true, error: null }
      if (['false', '0', 'no', 'n'].includes(lower)) return { value: false, error: null }
      return { value: null, error: `"${field.label}" must be true/false` }
    }
    case 'date': {
      const d = new Date(str)
      if (Number.isNaN(d.getTime())) return { value: null, error: `"${field.label}" is not a valid date` }
      return { value: str, error: null } // model stores dates as free-text strings (see Guard/Site/Customer schemas) -- keep the original text once it parses
    }
    case 'enum': {
      const match = field.enumValues?.find((v) => v.toLowerCase() === str.toLowerCase())
      if (!match) return { value: null, error: `"${field.label}" must be one of: ${field.enumValues?.join(', ')}` }
      return { value: match, error: null }
    }
    default:
      return { value: str, error: null }
  }
}

/** Coerces every mapped cell to its target type and checks required/enum rules. Returns the coerced object plus any error messages. */
export function coerceMappedRow(
  mapped: Record<string, unknown>,
  fields: FieldSpec[]
): { data: Record<string, unknown>; errors: string[] } {
  const data: Record<string, unknown> = {}
  const errors: string[] = []

  for (const field of fields) {
    const raw = mapped[field.key]
    const { value, error } = coerceValue(field, raw)
    if (error) {
      errors.push(error)
      continue
    }
    if (field.required && isBlank(value)) {
      errors.push(`"${field.label}" is required`)
      continue
    }
    if (value !== null) data[field.key] = value
  }

  return { data, errors }
}
