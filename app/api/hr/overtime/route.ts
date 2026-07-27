import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'

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
    prisma.overtimeRequest.findMany({ where, orderBy: { date: 'desc' }, ...paginate(page) }),
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

  const guard = await prisma.guard.findFirst({ where: { id: guardId, companyId: session.companyId } })
  if (!guard) return NextResponse.json({ error: 'Guard not found' }, { status: 404 })

  const request = await prisma.overtimeRequest.create({
    data: { guardId, companyId: session.companyId, date: new Date(date), hoursRequested: Number(hoursRequested), reason: reason || null },
  })

  await logAudit({
    companyId: session.companyId, userId: session.userId, userName: session.name,
    action: 'CREATE', module: 'OvertimeRequest', recordId: request.id,
    newValues: { guard: guard.full_name ?? '', date, hoursRequested },
  })

  return NextResponse.json({ request: { ...request, guard: { id: guard.id, name: guard.full_name ?? '' } } }, { status: 201 })
}
