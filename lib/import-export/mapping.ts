import type { FieldSpec } from './types'

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Classic edit-distance similarity, 0 (no match) to 1 (identical), used as a fallback when exact/substring matching fails. */
function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  const distance = dp[a.length][b.length]
  return 1 - distance / Math.max(a.length, b.length)
}

export interface MappingSuggestion {
  header: string
  fieldKey: string | null
  confidence: number
}

/** Proposes a header -> field mapping for the wizard to display; never applied silently, only ever a suggestion the user confirms or edits. */
export function suggestMapping(headers: string[], fields: FieldSpec[]): MappingSuggestion[] {
  const usedKeys = new Set<string>()

  return headers.map((header) => {
    const normHeader = normalize(header)
    let best: { key: string; score: number } | null = null

    for (const field of fields) {
      if (usedKeys.has(field.key)) continue
      for (const candidate of [field.key, field.label]) {
        const normCandidate = normalize(candidate)
        if (!normCandidate) continue
        let score: number
        if (normHeader === normCandidate) score = 1
        else if (normHeader.includes(normCandidate) || normCandidate.includes(normHeader)) score = 0.75
        else score = similarity(normHeader, normCandidate)
        if (!best || score > best.score) best = { key: field.key, score }
      }
    }

    const fieldKey = best && best.score >= 0.55 ? best.key : null
    if (fieldKey) usedKeys.add(fieldKey)
    return { header, fieldKey, confidence: best?.score ?? 0 }
  })
}
