import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const leave = await prisma.leaveRequest.findFirst({
    where: { id: params.id, companyId },
    include: { guard: { select: { full_name: true, ecocash_number: true, phone: true } } },
  })
  if (!leave) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (leave.status !== 'PENDING') return NextResponse.json({ error: 'Leave request is no longer pending' }, { status: 409 })

  const startStr = leave.startDate.toLocaleDateString()
  const endStr = leave.endDate?.toLocaleDateString() ?? startStr

  if (action === 'approve') {
    const updated = await prisma.leaveRequest.update({
      where: { id: params.id },
      data: { status: 'APPROVED', approvedBy: userId },
    })

    // Create attendance records for each day of leave
    const days: Date[] = []
    const cur = new Date(leave.startDate)
    const end = leave.endDate ? new Date(leave.endDate) : new Date(leave.startDate)
    while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }

    await Promise.all(days.map((day) =>
      prisma.attendance.upsert({
        where: { guardId_date: { guardId: leave.guardId, date: day } },
        update: { status: 'LEAVE' },
        create: {
          id: crypto.randomUUID(), guardId: leave.guardId,
          siteId: 'leave', date: day, status: 'LEAVE' as const, hoursWorked: 0, overtimeHours: 0,
        },
      })
    ))

    // WhatsApp notification (fire-and-forget)
    if (leave.guard.phone && process.env.WHATSAPP_WEBHOOK_URL) {
      fetch(process.env.WHATSAPP_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: leave.guard.phone, message: `✅ Leave Approved: ${startStr} to ${endStr}` }),
      }).catch(() => {})
    }

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'LeaveRequest', recordId: params.id, oldValues: { status: 'PENDING' }, newValues: { status: 'APPROVED' } })
    return NextResponse.json({ request: updated })
  }

  if (action === 'reject') {
    const { rejectionNote } = await req.json()
    const updated = await prisma.leaveRequest.update({
      where: { id: params.id },
      data: { status: 'REJECTED', rejectionNote: rejectionNote || null, approvedBy: userId },
    })

    // WhatsApp notification (fire-and-forget)
    if (leave.guard.phone && process.env.WHATSAPP_WEBHOOK_URL) {
      fetch(process.env.WHATSAPP_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: leave.guard.phone, message: `❌ Leave request for ${startStr} to ${endStr} was not approved.` }),
      }).catch(() => {})
    }

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'LeaveRequest', recordId: params.id, oldValues: { status: 'PENDING' }, newValues: { status: 'REJECTED', rejectionNote } })
    return NextResponse.json({ request: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
