import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGuardSession } from '@/lib/portal-auth'
import { logAudit } from '@/lib/audit'

// Leave balance is deducted in working days, not calendar days — mirrors
// app/api/hr/leave/route.ts's countWeekdays so a guard's own request is
// costed identically to one an HR manager enters on their behalf.
function countWeekdays(start: Date, end: Date): number {
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export async function GET() {
  const session = await getGuardSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.guardId) return NextResponse.json({ requests: [] })

  const requests = await prisma.leaveRequest.findMany({
    where: { guardId: session.guardId },
    orderBy: { startDate: 'desc' },
    take: 24,
    select: { id: true, leaveType: true, startDate: true, endDate: true, days: true, reason: true, status: true },
  })

  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest) {
  const session = await getGuardSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.guardId) return NextResponse.json({ error: 'No linked employee record for this account' }, { status: 400 })

  const body = await req.json()
  const { leaveType, startDate, endDate, reason } = body
  if (!startDate) return NextResponse.json({ error: 'startDate is required' }, { status: 400 })

  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date(startDate)
  const days = Math.max(1, countWeekdays(start, end))

  const request = await prisma.leaveRequest.create({
    data: {
      id: crypto.randomUUID(),
      companyId: session.companyId,
      guardId: session.guardId,
      leaveType: leaveType || 'ANNUAL',
      startDate: start,
      endDate: end,
      days,
      reason: reason || null,
      status: 'PENDING',
    },
  })

  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'LeaveRequest', recordId: request.id, newValues: request })
  return NextResponse.json({ request }, { status: 201 })
}
