import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const guardId = searchParams.get('guardId')
  const type = searchParams.get('type') // annual|sick|maternity|paternity|compassionate|unpaid
  const month = searchParams.get('month') // YYYY-MM for calendar view

  const where: any = { companyId }
  if (status) where.status = status
  if (guardId) where.guardId = guardId
  if (type) where.leaveType = type.toUpperCase()

  // If month provided, restrict to leaves overlapping that month
  let monthStart: Date | null = null
  let monthEnd: Date | null = null
  if (month) {
    const [y, m] = month.split('-').map(Number)
    if (!isNaN(y) && !isNaN(m)) {
      monthStart = new Date(Date.UTC(y, m - 1, 1))
      monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
    }
  }

  const rows = await prisma.leaveRequest.findMany({
    where: monthStart && monthEnd ? {
      AND: [
        where,
        {
          OR: [
            { startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
            { startDate: { gte: monthStart, lte: monthEnd } },
          ]
        }
      ]
    } : where,
    include: {
      guard: { select: { id: true, full_name: true, employee_code: true, leave_days_entitled: true } },
      approvedByUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const leave = rows.map((l) => ({
    ...l,
    guard: l.guard ? { id: l.guard.id, name: l.guard.full_name, employeeNumber: l.guard.employee_code } : null,
  }))

  // If guardId provided, compute leave balance for that guard
  let balance = null
  if (guardId) {
    const guard = await prisma.guard.findUnique({ where: { id: guardId }, select: { leave_days_entitled: true } })
    const entitled = guard?.leave_days_entitled ?? 30
    // compute taken for current year (approved only)
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    const approvedLeaves = await prisma.leaveRequest.findMany({ where: { companyId, guardId, status: 'APPROVED', AND: [{ startDate: { lte: yearEnd } }, { endDate: { gte: yearStart } }] }, select: { days: true } })
    const taken = approvedLeaves.reduce((s, l) => s + (l.days ?? 0), 0)
    balance = { entitled, taken, remaining: Math.max(0, entitled - taken) }
  }

  // If month requested, return calendar-friendly array
  let calendar = null
  if (monthStart && monthEnd) {
    calendar = leave.map(l => ({
      id: l.id,
      guardId: l.guardId,
      guardName: l.guard?.name,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate: l.endDate,
      days: l.days,
      status: l.status,
    }))
  }

  return NextResponse.json({ leave, balance, calendar })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { guardId, leaveType, startDate, endDate, reason } = body

  if (!guardId || !startDate) return NextResponse.json({ error: 'guardId and startDate are required' }, { status: 400 })

  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date(startDate)
  const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1

  const request = await prisma.leaveRequest.create({
    data: {
      id: crypto.randomUUID(), companyId, guardId,
      leaveType: leaveType || 'ANNUAL',
      startDate: start, endDate: end,
      days, reason: reason || null,
      status: 'PENDING',
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'LeaveRequest', recordId: request.id, newValues: request })
  return NextResponse.json({ request }, { status: 201 })
}
