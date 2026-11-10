import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate, pageLimit } from '@/lib/utils'

// Weekly overtime above this is accepted but returned with a warning.
const WEEKLY_OVERTIME_WARNING_HOURS = Number(process.env.WEEKLY_OVERTIME_WARNING_HOURS ?? 72)

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const guardId = searchParams.get('guardId') || undefined
  const page = Number(searchParams.get('page') ?? '1')

  const where: any = { companyId: session.companyId, ...(status && { status }), ...(guardId && { guardId }) }

  const [rows, total] = await Promise.all([
    prisma.overtimeRequest.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'asc' }], ...paginate(page, pageLimit(searchParams)) }),
    prisma.overtimeRequest.count({ where }),
  ])

  const guardIds = Array.from(new Set(rows.map((r) => r.guardId)))
  const guards = guardIds.length ? await prisma.guard.findMany({ where: { id: { in: guardIds } }, select: { id: true, full_name: true } }) : []
  const guardMap = Object.fromEntries(guards.map((g) => [g.id, g.full_name]))

  return NextResponse.json({
    overtimeRequests: rows.map((r) => ({ ...r, guard: { id: r.guardId, name: guardMap[r.guardId] ?? '' } })),
    total,
    page,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { guardId, date, hoursRequested, reason } = body
  if (!guardId || !date || !hoursRequested) return NextResponse.json({ error: 'guardId, date, hoursRequested required' }, { status: 400 })
  if (Number(hoursRequested) <= 0) return NextResponse.json({ error: 'hoursRequested must be greater than zero' }, { status: 400 })

  const day = new Date(date)
  if (isNaN(day.getTime())) return NextResponse.json({ error: 'date is not a valid date', code: 'VALIDATION_ERROR' }, { status: 400 })

  const guard = await prisma.guard.findFirst({ where: { id: guardId, companyId: session.companyId } })
  if (!guard) return NextResponse.json({ error: 'Guard not found' }, { status: 404 })

  // P1-11 (BUG-018): 30 hours in one day was accepted. A day's overtime plus
  // the guard's scheduled shift can't exceed 24 hours.
  const scheduled = await prisma.deployment.findFirst({
    where: { guardId, companyId: session.companyId, status: 'ACTIVE', startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
    select: { hoursPerDay: true },
  })
  const scheduledHours = Number(scheduled?.hoursPerDay ?? 0)
  const dayStart = new Date(day); dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  const alreadyRequested = await prisma.overtimeRequest.aggregate({
    where: { guardId, date: { gte: dayStart, lt: dayEnd }, status: { not: 'REJECTED' } },
    _sum: { hoursRequested: true },
  })
  const maxToday = Math.max(0, 24 - scheduledHours - Number(alreadyRequested._sum.hoursRequested ?? 0))
  if (Number(hoursRequested) > maxToday) {
    return NextResponse.json({
      error: `At most ${maxToday} overtime hour(s) are possible that day (${scheduledHours}h scheduled)`,
      code: 'OVERTIME_EXCEEDS_DAY',
    }, { status: 400 })
  }

  const request = await prisma.overtimeRequest.create({
    data: { guardId, companyId: session.companyId, date: day, hoursRequested: Number(hoursRequested), reason: reason || null },
  })

  // Above the weekly limit is allowed but flagged for the approver.
  const weekStart = new Date(dayStart.getTime() - ((dayStart.getUTCDay() + 6) % 7) * 86_400_000)
  const week = await prisma.overtimeRequest.aggregate({
    where: { guardId, date: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * 86_400_000) }, status: { not: 'REJECTED' } },
    _sum: { hoursRequested: true },
  })
  const weekHours = Number(week._sum.hoursRequested ?? 0)
  const warning = weekHours > WEEKLY_OVERTIME_WARNING_HOURS
    ? `${weekHours} overtime hours this week exceeds the ${WEEKLY_OVERTIME_WARNING_HOURS}h guideline`
    : undefined

  await logAudit({
    companyId: session.companyId, userId: session.userId, userName: session.name,
    action: 'CREATE', module: 'OvertimeRequest', recordId: request.id,
    newValues: { guard: guard.full_name ?? '', date, hoursRequested },
  })

  return NextResponse.json({ request: { ...request, guard: { id: guard.id, name: guard.full_name ?? '' } }, ...(warning && { warning }) }, { status: 201 })
}
