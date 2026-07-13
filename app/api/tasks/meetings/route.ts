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
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const meetings = await prisma.meeting.findMany({
    where: {
      companyId,
      ...(status ? { status: status as 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' } : {}),
      ...(from || to ? { meetingDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    orderBy: { meetingDate: 'asc' },
  })

  const attendees = await prisma.meetingAttendee.findMany({
    where: { meetingId: { in: meetings.map((m) => m.id) } },
  })

  const userIds = Array.from(
    new Set([
      ...meetings.map((m) => m.organizerId),
      ...attendees.map((a) => a.userId),
    ])
  )

  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, whatsapp: true } })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const attendeesByMeeting = attendees.reduce<Record<string, typeof attendees>>((acc, attendee) => {
    acc[attendee.meetingId] = acc[attendee.meetingId] ?? []
    acc[attendee.meetingId].push(attendee)
    return acc
  }, {})

  const result = meetings.map((m) => ({
    ...m,
    organizerUser: userMap[m.organizerId] ?? null,
    attendeeUsers: (attendeesByMeeting[m.id] ?? []).map((a) => ({
      ...a,
      user: userMap[a.userId] ?? null,
    })),
  }))

  return NextResponse.json({ meetings: result })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { title, description, meetingDate, startTime, endTime, location, attendeeIds, whatsappReminder, reminderTime } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!meetingDate) return NextResponse.json({ error: 'meetingDate is required' }, { status: 400 })
  if (!startTime || !endTime) return NextResponse.json({ error: 'startTime and endTime are required' }, { status: 400 })
  if (new Date(endTime) <= new Date(startTime)) return NextResponse.json({ error: 'endTime must be after startTime' }, { status: 400 })
  if (whatsappReminder) {
    if (!reminderTime) return NextResponse.json({ error: 'reminderTime is required when WhatsApp reminder is enabled' }, { status: 400 })
    if (new Date(reminderTime) >= new Date(meetingDate)) return NextResponse.json({ error: 'reminderTime must be before the meeting date' }, { status: 400 })
  }

  const allAttendeeIds: string[] = Array.isArray(attendeeIds) ? attendeeIds : []
  if (!allAttendeeIds.includes(userId)) allAttendeeIds.push(userId)

  const meeting = await prisma.meeting.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      title,
      description: description || null,
      organizerId: userId,
      location: location || null,
      meetingDate: new Date(meetingDate),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      whatsappReminder: !!whatsappReminder,
      reminderTime: reminderTime ? new Date(reminderTime) : null,
      updatedAt: new Date(),
    },
  })

  if (allAttendeeIds.length) {
    await prisma.meetingAttendee.createMany({
      data: allAttendeeIds.map((uid) => ({
        id: crypto.randomUUID(),
        meetingId: meeting.id,
        userId: uid,
      })),
    })
  }

  // Notify attendees (skip organizer)
  const otherAttendees = allAttendeeIds.filter((id) => id !== userId)
  for (const attendeeId of otherAttendees) {
    await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: attendeeId,
        companyId,
        title: 'Meeting Invitation',
        message: `You have been invited to "${title}"`,
        type: 'MEETING_INVITE',
        link: '/tasks-requests/meetings',
      },
    })
  }

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'Meetings', recordId: meeting.id, newValues: { title, meetingDate } })
  return NextResponse.json({ meeting }, { status: 201 })
}
