import { NextRequest, NextResponse } from 'next/server'
import { syncRbzExchangeRates } from '@/lib/rbz-rates'
import { isValidCronRequest } from '@/lib/cron-auth'

export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRbzExchangeRates()
    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sync RBZ rates' }, { status: 502 })
  }
}
