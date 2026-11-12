import { ApiError } from '@/lib/api-error'

// A5: RBZ publishes the day's rates only as an HTML table on its website.
// The parser reads table cells as plain text instead of matching exact
// markup, so styling changes (the date split across <span>s broke the old
// regex) don't break it. It takes the first block that starts with
// "EXCHANGE RATES <date>" and collects the CUR/CUR rows that follow, stopping
// at the first row that isn't a rate (the page carries other tabs and an
// archived 2018 table with the same headers).
export const RBZ_URL = 'https://www.rbz.co.zw/index.php/13-daily-exchange-rates'

export interface RbzRate { base: string; target: string; bid: number; ask: number; avg: number }

export function rbzParseFailed(detail: string) {
  return new ApiError(`Could not read today's rates from the RBZ website (${detail}). Enter the rate manually.`, 422, 'RBZ_PARSE_FAILED')
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[\s ]+/g, ' ')
    .trim()
}

function rows(html: string): string[][] {
  const out: string[][] = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = trRe.exec(html))) {
    const cells: string[] = []
    const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let c: RegExpExecArray | null
    while ((c = tdRe.exec(m[1]))) cells.push(text(c[1]))
    out.push(cells.filter((x) => x !== ''))
  }
  return out
}

const DATE_RE = /EXCHANGE RATES\s*(?:AS AT|FOR)?\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})/i
const PAIR_RE = /^([A-Z]{3})\s*\/\s*([A-Z]{3})$/
const num = (s: string) => {
  const n = Number(s.replace(/,/g, ''))
  return s.trim() !== '' && Number.isFinite(n) ? n : NaN
}

export function parseRbzRates(html: string): { effectiveDate: Date; rates: RbzRate[] } {
  const all = rows(html)
  const start = all.findIndex((r) => DATE_RE.test(r.join(' ')))
  if (start === -1) throw rbzParseFailed('no "EXCHANGE RATES <date>" heading found')
  const [, dd, mm, yyyy] = DATE_RE.exec(all[start].join(' '))!
  const effectiveDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  if (isNaN(effectiveDate.getTime()) || effectiveDate.getUTCDate() !== Number(dd)) throw rbzParseFailed(`invalid date ${dd}-${mm}-${yyyy}`)

  const rates: RbzRate[] = []
  for (const r of all.slice(start + 1)) {
    const pair = r.length >= 4 ? PAIR_RE.exec(r[0]) : null
    const [bid, ask, avg] = r.slice(1, 4).map(num)
    if (pair && [bid, ask, avg].every((v) => Number.isFinite(v) && v > 0)) {
      rates.push({ base: pair[1], target: pair[2], bid, ask, avg })
    } else if (rates.length > 0) {
      break
    }
  }
  if (rates.length === 0) throw rbzParseFailed('no currency rows found under the heading')
  return { effectiveDate, rates }
}

export async function fetchRbzRates(): Promise<{ effectiveDate: Date; rates: RbzRate[] }> {
  let res: Response
  try {
    res = await fetch(RBZ_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RavenshieldERP/1.0)' }, cache: 'no-store', signal: AbortSignal.timeout(20000) })
  } catch {
    throw new ApiError('The RBZ website could not be reached. Try again later or enter the rate manually.', 503, 'RBZ_UNAVAILABLE')
  }
  if (!res.ok) throw new ApiError(`The RBZ website returned HTTP ${res.status}. Try again later or enter the rate manually.`, 503, 'RBZ_UNAVAILABLE')
  return parseRbzRates(await res.text())
}

// A rate older than this is flagged on the Exchange Rates page and dashboard.
export const STALE_RATE_DAYS = 3
export function isRateStale(latest: Date | null | undefined, now = new Date()): boolean {
  if (!latest) return true
  return now.getTime() - new Date(latest).getTime() > STALE_RATE_DAYS * 86400000
}
