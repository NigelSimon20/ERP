import { NextRequest, NextResponse } from 'next/server'
import { runOverdueInvoiceAlerts } from '@/lib/alerts'
import { isValidCronRequest } from '@/lib/cron-auth'

export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runOverdueInvoiceAlerts()
  return NextResponse.json(result)
}
