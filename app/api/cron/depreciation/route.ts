import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidCronRequest } from '@/lib/cron-auth'
import { runMonthEndDepreciation, periodOf } from '@/lib/fixed-assets'

// Month-end depreciation (P1-11), run on the 1st for the month just ended.
// Idempotent: each asset is charged at most once per month.
export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const now = new Date()
  const period = new URL(req.url).searchParams.get('period') ?? periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
  const companies = await prisma.company.findMany({
    where: { accumulatedDepreciationAccountId: { not: null }, depreciationExpenseAccountId: { not: null } },
    select: { id: true },
  })
  const results = []
  for (const c of companies) results.push({ companyId: c.id, ...(await runMonthEndDepreciation(prisma, c.id, period)) })
  return NextResponse.json({ period, companies: results.length, results })
}
