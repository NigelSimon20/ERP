import { NextRequest, NextResponse } from 'next/server'
import { syncRbzExchangeRates } from '@/lib/rbz-rates'
import { isValidCronRequest } from '@/lib/cron-auth'
import { apiError } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRbzExchangeRates()
    return NextResponse.json(result)
  } catch (err: unknown) {
    return apiError(err, 'Failed to sync RBZ rates', 502)
  }
}
