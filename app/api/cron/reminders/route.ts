import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage, sendMeetingReminder } from '@/lib/whatsapp'
import { formatDate, formatTime } from '@/lib/utils'
import { isValidCronRequest } from '@/lib/cron-auth'

export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let tasksProcessed = 0
  let meetingsProcessed = 0
  let requestsProcessed = 0

  // ── Task reminders ────────────────────────────────────────────────────────
  const dueTasks = await prisma.task.findMany({
    where: { whatsappReminder: true, reminderSent: false, reminderTime: { lte: now } },
  })

  for (const task of dueTasks) {
    const user = await prisma.user.findUnique({ where: { id: task.assignedTo } })
    if (user?.whatsapp) {
      await sendWhatsAppMessage({
        to: user.whatsapp,
        message: `🔔 *Task Reminder — Ravenshield*\n\n*${task.title}*\nDue: ${formatDate(task.dueDate)}\nPriority: ${task.priority}\n\n_Ravenshield Security ERP_`,
      }).catch(() => {})
    }
    await prisma.task.update({ where: { id: task.id }, data: { reminderSent: true } })
    tasksProcessed++
  }

  // ── Meeting reminders ─────────────────────────────────────────────────────
  const dueMeetings = await prisma.meeting.findMany({
    where: { whatsappReminder: true, reminderSent: false, reminderTime: { lte: now } },
  })

  for (const meeting of dueMeetings) {
    const attendees = await prisma.meetingAttendee.findMany({
      where: { meetingId: meeting.id },
      select: { userId: true },
    })
    const userIds = attendees.map((a) => a.userId)
    const users = await prisma.user.findMany({ where: { id: { in: userIds }, whatsapp: { not: null } } })
    for (const user of users) {
      if (user.whatsapp) {
        await sendMeetingReminder({
          to: user.whatsapp,
          date: formatDate(meeting.meetingDate),
          time: formatTime(meeting.meetingDate),
        }).catch(() => {})
      }
    }
    await prisma.meeting.update({ where: { id: meeting.id }, data: { reminderSent: true } })
    meetingsProcessed++
  }

  // ── Request reminders ─────────────────────────────────────────────────────
  const dueRequests = await prisma.request.findMany({
    where: { whatsappReminder: true, reminderSent: false, reminderTime: { lte: now } },
  })

  for (const request of dueRequests) {
    if (request.assignedTo) {
      const user = await prisma.user.findUnique({ where: { id: request.assignedTo } })
      if (user?.whatsapp) {
        await sendWhatsAppMessage({
          to: user.whatsapp,
          message: `📋 *Request Reminder — Ravenshield*\n\n*${request.title}*\nType: ${request.requestType}\nStatus: ${request.status}\n\n_Ravenshield Security ERP_`,
        }).catch(() => {})
      }
    }
    await prisma.request.update({ where: { id: request.id }, data: { reminderSent: true } })
    requestsProcessed++
  }

  return NextResponse.json({ processed: { tasks: tasksProcessed, meetings: meetingsProcessed, requests: requestsProcessed } })
}
