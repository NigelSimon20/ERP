import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'OPERATIONS_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.overtimeRequest.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.guardId && session.guardId === existing.guardId) {
    return NextResponse.json({ error: 'You cannot approve or reject your own overtime request' }, { status: 400 })
  }
  if (existing.status !== 'PENDING') return NextResponse.json({ error: 'Overtime request is no longer pending' }, { status: 409 })

  if (action === 'approve') {
    const { count } = await prisma.overtimeRequest.updateMany({ where: { id: params.id, status: 'PENDING' }, data: { status: 'APPROVED', approvedBy: userId } })
    if (count === 0) return NextResponse.json({ error: 'Overtime request is no longer pending' }, { status: 409 })

    // Feed approved overtime into Attendance.overtimeHours, which payroll
    // sums across the pay period -- same source of truth used everywhere
    // else overtime pay is calculated.
    await prisma.attendance.upsert({
      where: { guardId_date: { guardId: existing.guardId, date: existing.date } },
      update: { overtimeHours: { increment: existing.hoursRequested } },
      create: { id: crypto.randomUUID(), guardId: existing.guardId, date: existing.date, hoursWorked: 0, overtimeHours: existing.hoursRequested },
    })

    const updated = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id: params.id } })
    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'OvertimeRequest', recordId: params.id, oldValues: { status: 'PENDING' }, newValues: { status: 'APPROVED' } })
    return NextResponse.json({ request: updated })
  }

  if (action === 'reject') {
    const { rejectionNote } = await req.json().catch(() => ({}))
    const { count } = await prisma.overtimeRequest.updateMany({ where: { id: params.id, status: 'PENDING' }, data: { status: 'REJECTED', rejectionNote: rejectionNote || null, approvedBy: userId } })
    if (count === 0) return NextResponse.json({ error: 'Overtime request is no longer pending' }, { status: 409 })
    const updated = await prisma.overtimeRequest.findUniqueOrThrow({ where: { id: params.id } })
    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'OvertimeRequest', recordId: params.id, oldValues: { status: 'PENDING' }, newValues: { status: 'REJECTED', rejectionNote } })
    return NextResponse.json({ request: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
