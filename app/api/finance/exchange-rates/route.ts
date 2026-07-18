import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { syncRbzExchangeRates } from '@/lib/rbz-rates'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const base = searchParams.get('base')
  const target = searchParams.get('target')

  if (base && target) {
    const rate = await prisma.exchangeRate.findFirst({
      where: { baseCurrency: base, targetCurrency: target },
      orderBy: { effectiveDate: 'desc' },
    })
    return NextResponse.json({ rate: rate ? { ...rate, rate: Number(rate.rate) } : null })
  }

  const rates = await prisma.exchangeRate.findMany({
    orderBy: { effectiveDate: 'desc' },
  })

  // Current rates: latest per pair
  const pairs = new Map<string, typeof rates[0]>()
  for (const r of rates) {
    const key = `${r.baseCurrency}-${r.targetCurrency}`
    if (!pairs.has(key)) pairs.set(key, r)
  }

  return NextResponse.json({
    rates: rates.map((r) => ({ ...r, rate: Number(r.rate) })),
    currentRates: Array.from(pairs.values()).map((r) => ({ ...r, rate: Number(r.rate) })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (new URL(req.url).searchParams.get('action') === 'sync-rbz') {
    try {
      const result = await syncRbzExchangeRates()
      await logAudit({
        companyId: session.companyId, userId: session.userId, userName: session.name,
        action: 'CREATE', module: 'ExchangeRates', recordId: 'rbz-sync',
        newValues: { effectiveDate: result.effectiveDate, count: result.count },
      })
      return NextResponse.json(result, { status: 201 })
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sync RBZ rates' }, { status: 502 })
    }
  }

  const body = await req.json()
  const { baseCurrency, targetCurrency, rate, effectiveDate } = body

  if (!baseCurrency || !targetCurrency || !rate || !effectiveDate) {
    return NextResponse.json({ error: 'baseCurrency, targetCurrency, rate, effectiveDate required' }, { status: 400 })
  }
  if (baseCurrency === targetCurrency) {
    return NextResponse.json({ error: 'Base and target currencies must differ' }, { status: 400 })
  }

  const entry = await prisma.exchangeRate.create({
    data: {
      id: crypto.randomUUID(),
      baseCurrency,
      targetCurrency,
      rate: Number(rate),
      effectiveDate: new Date(effectiveDate),
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'ExchangeRates', recordId: entry.id })
  return NextResponse.json({ rate: { ...entry, rate: Number(entry.rate) } }, { status: 201 })
}
