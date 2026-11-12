import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidCronRequest } from '@/lib/cron-auth'
import { reconcileCompany, notifyReconcileDifferences } from '@/lib/reconcile'
import { pruneIdempotencyKeys } from '@/lib/idempotency'

// Nightly (vercel.json): recompute every company's balances from the ledger
// and alert finance admins on any difference (P1-3). Reports only.
// Also deletes Idempotency-Keys older than 24 hours (A7).
export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companies = await prisma.company.findMany({ select: { id: true } })
  const results = []
  for (const c of companies) {
    const r = await reconcileCompany(prisma, c.id)
    const notified = await notifyReconcileDifferences(prisma, r)
    results.push({ companyId: c.id, clean: r.clean, differences: r.differences.length, notified })
  }
  const prunedIdempotencyKeys = await pruneIdempotencyKeys()
  return NextResponse.json({ prunedIdempotencyKeys, companies: results.length, clean: results.filter((r) => r.clean).length, results })
}
