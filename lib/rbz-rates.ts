import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// RBZ has no official JSON/CSV API for the current day's rates -- they are
// only published as an HTML table on this page. This scrapes that table.
const RBZ_URL = 'https://www.rbz.co.zw/index.php/13-daily-exchange-rates'

export interface RbzRate {
  base: string
  target: string
  bid: number
  ask: number
  avg: number
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

export async function fetchRbzExchangeRates(): Promise<{ effectiveDate: Date; rates: RbzRate[] }> {
  const res = await fetch(RBZ_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RavenshieldERP/1.0)' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`RBZ site returned HTTP ${res.status}`)
  const html = await res.text()

  // The page also renders an archived (2018) rates table further down with
  // the same CURRENCY/BID/ASK/AVG headers -- scope to the "Exchange Rates"
  // tab panel only so that table is never matched.
  const tabStart = html.indexOf('id="baTab0"')
  const tabEnd = html.indexOf('id="baTab1"')
  if (tabStart === -1) throw new Error('Could not locate RBZ exchange rates table (page layout may have changed)')
  const scoped = tabEnd > tabStart ? html.slice(tabStart, tabEnd) : html.slice(tabStart)

  const dateMatch = scoped.match(/EXCHANGE RATES\s+(\d{2})-(\d{2})-(\d{4})/)
  if (!dateMatch) throw new Error('Could not find exchange rate date on RBZ page')
  const [, dd, mm, yyyy] = dateMatch
  const effectiveDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))

  const rowRe = /<tr[^>]*>\s*<td[^>]*><span[^>]*><strong>([A-Z]{3})\/([A-Z]{3})<\/strong>[\s\S]*?<\/span><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g

  const rates: RbzRate[] = []
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(scoped))) {
    const [, base, target, bidHtml, askHtml, avgHtml] = m
    const bid = parseFloat(stripTags(bidHtml))
    const ask = parseFloat(stripTags(askHtml))
    const avg = parseFloat(stripTags(avgHtml))
    if (Number.isFinite(bid) && Number.isFinite(ask) && Number.isFinite(avg)) {
      rates.push({ base, target, bid, ask, avg })
    }
  }

  if (rates.length === 0) throw new Error('Parsed zero exchange rate rows from RBZ page (layout may have changed)')

  return { effectiveDate, rates }
}

export async function syncRbzExchangeRates() {
  const { effectiveDate, rates } = await fetchRbzExchangeRates()

  for (const r of rates) {
    // No unique constraint on (baseCurrency, targetCurrency, effectiveDate),
    // so replace any existing row for the same pair/day rather than upsert,
    // making repeat cron runs / manual re-syncs on the same day idempotent.
    await prisma.exchangeRate.deleteMany({
      where: { baseCurrency: r.base, targetCurrency: r.target, effectiveDate },
    })
    await prisma.exchangeRate.create({
      data: {
        id: crypto.randomUUID(),
        baseCurrency: r.base,
        targetCurrency: r.target,
        rate: r.avg,
        effectiveDate,
      },
    })
  }

  return { effectiveDate: effectiveDate.toISOString(), count: rates.length, rates }
}
