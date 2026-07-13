import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { logAudit } from '@/lib/audit'
import { formatDateTime } from '@/lib/utils'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.meeting.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const attendees = await prisma.meetingAttendee.findMany({ where: { meetingId: params.id } })

  if (action === 'complete') {
    const body = await req.json()
    const { notes } = body

    const meeting = await prisma.meeting.update({
      where: { id: params.id },
      data: { status: 'COMPLETED', notes: notes || null },
    })

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Meetings', recordId: params.id, oldValues: { status: 'SCHEDULED' }, newValues: { status: 'COMPLETED' } })
    return NextResponse.json({ meeting })
  }

  if (action === 'cancel') {
    const meeting = await prisma.meeting.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    })

    // Notify all attendees in-app
    const attendeeIds = attendees.map((a) => a.userId).filter((id) => id !== userId)
    for (const attendeeId of attendeeIds) {
      await prisma.notification.create({
        data: {
          id: crypto.randomUUID(),
          userId: attendeeId,
          companyId,
          title: 'Meeting Cancelled',
          message: `Meeting "${existing.title}" scheduled for ${formatDateTime(existing.meetingDate)} has been cancelled`,
          type: 'MEETING_CANCELLED',
          link: '/tasks-requests/meetings',
        },
      })
    }

    // WhatsApp to those with numbers
    const attendeeUsers = await prisma.user.findMany({
      where: { id: { in: attendeeIds }, whatsapp: { not: null } },
      select: { whatsapp: true },
    })
    for (const user of attendeeUsers) {
      if (user.whatsapp) {
        sendWhatsAppMessage({
          to: user.whatsapp,
          message: `❌ Meeting Cancelled: *${existing.title}* scheduled for ${formatDateTime(existing.meetingDate)}`,
        }).catch(() => {})
      }
    }

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Meetings', recordId: params.id, oldValues: { status: 'SCHEDULED' }, newValues: { status: 'CANCELLED' } })
    return NextResponse.json({ meeting })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
