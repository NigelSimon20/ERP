import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, companyId } = session
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(today.getTime() + 86_400_000)
  const weekMonday = new Date(today)
  weekMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const sevenDaysOut = new Date(today.getTime() + 7 * 86_400_000)

  const [
    myOpenTasks, overdueCount, dueTodayCount, completedThisWeek,
    myRequests, unreadNotifications, upcomingDeadlines,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { companyId, assignedTo: userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      select: { id: true, title: true, dueDate: true, priority: true, status: true },
    }),
    prisma.task.count({ where: { companyId, assignedTo: userId, dueDate: { lt: today }, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.task.count({ where: { companyId, assignedTo: userId, dueDate: { gte: today, lt: todayEnd }, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.task.count({ where: { companyId, assignedTo: userId, status: 'COMPLETED', completedAt: { gte: weekMonday } } }),
    prisma.request.findMany({
      where: { companyId, requestedBy: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, requestType: true, title: true, status: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.task.findMany({
      where: { companyId, assignedTo: userId, dueDate: { gte: today, lte: sevenDaysOut }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { dueDate: 'asc' },
      select: { id: true, title: true, dueDate: true, priority: true },
    }),
  ])

  const meetingAttendeeRows = await prisma.meetingAttendee.findMany({
    where: { userId },
    select: { meetingId: true },
  })

  const meetingIds = meetingAttendeeRows.map((row) => row.meetingId)
  const attendeeMeetingsToday = meetingIds.length > 0
    ? await prisma.meeting.findMany({
        where: { id: { in: meetingIds }, meetingDate: { gte: today, lt: todayEnd } },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          location: true,
          organizerId: true,
          meetingDate: true,
          status: true,
        },
      })
    : []

  const attendeeMeetingsWeek = meetingIds.length > 0
    ? await prisma.meeting.count({
        where: {
          id: { in: meetingIds },
          meetingDate: { gte: weekMonday, lt: new Date(weekMonday.getTime() + 7 * 86_400_000) },
          status: 'SCHEDULED',
        },
      })
    : 0

  // Resolve organizer names for today's meetings
  const organizerIds = Array.from(new Set(attendeeMeetingsToday.map(r => r.organizerId)))
  const organizers = await prisma.user.findMany({ where: { id: { in: organizerIds } }, select: { id: true, name: true } })
  const organizerMap = Object.fromEntries(organizers.map(o => [o.id, o.name]))

  return NextResponse.json({
    taskStats: {
      total:             myOpenTasks.length,
      overdue:           overdueCount,
      dueToday:          dueTodayCount,
      completedThisWeek,
    },
    myTasks: myOpenTasks.map(t => ({ ...t, dueDate: t.dueDate.toISOString() })),
    meetingsToday: attendeeMeetingsToday.map(r => ({
      id:        r.id,
      title:     r.title,
      startTime: r.startTime.toISOString(),
      endTime:   r.endTime.toISOString(),
      location:  r.location,
      organizer: organizerMap[r.organizerId] ?? 'Unknown',
    })),
    meetingsThisWeek:    attendeeMeetingsWeek,
    unreadNotifications,
    upcomingDeadlines:   upcomingDeadlines.map(t => ({ ...t, dueDate: t.dueDate.toISOString() })),
    myRequests:          myRequests.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
  })
}
