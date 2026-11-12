import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { syncRbzExchangeRates } from '@/lib/rbz-rates'
import { isValidCronRequest } from '@/lib/cron-auth'
import { apiError, ApiError } from '@/lib/api-error'

// Daily RBZ sync (vercel.json: "15 9 * * *"). A5: when it fails, every
// company's admins and finance managers get one notification per day saying
// so, and that rates can be entered by hand.
export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRbzExchangeRates()
    return NextResponse.json(result)
  } catch (err: unknown) {
    await notifySyncFailed(err instanceof ApiError ? err.message : 'The RBZ rates could not be synced.').catch((e) => console.error('[rbz-cron] notify failed', e))
    return apiError(err, 'Failed to sync RBZ rates', 502)
  }
}

async function notifySyncFailed(message: string) {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const [users, alreadyToday] = await Promise.all([
    prisma.user.findMany({ where: { active: true, role: { in: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'] } }, select: { id: true, companyId: true } }),
    prisma.notification.findMany({ where: { type: 'RBZ_SYNC_FAILED', createdAt: { gte: startOfDay } }, select: { userId: true } }),
  ])
  const notified = new Set(alreadyToday.map((n) => n.userId))
  const data = users.filter((u) => !notified.has(u.id)).map((u) => ({
    id: crypto.randomUUID(), userId: u.id, companyId: u.companyId, type: 'RBZ_SYNC_FAILED',
    title: 'Daily RBZ exchange-rate sync failed', message, link: '/finance/exchange-rates',
  }))
  if (data.length) await prisma.notification.createMany({ data })
}
