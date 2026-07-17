import { NextRequest, NextResponse } from 'next/server'
import { runContractExpiryAlerts, runLowStockAlerts } from '@/lib/alerts'
import { isValidCronRequest } from '@/lib/cron-auth'

export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [contracts, stock] = await Promise.all([
    runContractExpiryAlerts(),
    runLowStockAlerts(),
  ])

  return NextResponse.json({ contracts, stock })
}
