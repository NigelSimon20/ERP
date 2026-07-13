import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const assignedTo = searchParams.get('assignedTo')
  const myTasks = searchParams.get('myTasks') === 'true'
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')

  const tasks = await prisma.task.findMany({
    where: {
      companyId,
      ...(myTasks ? { assignedTo: userId } : assignedTo ? { assignedTo } : {}),
      ...(status ? { status: status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' } : {}),
      ...(priority ? { priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' } : {}),
      ...(from || to ? { dueDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
  })

  // Attach assignedTo and assignedBy user names
  const userIds = Array.from(new Set(tasks.flatMap((t) => [t.assignedTo, t.assignedBy])))
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, whatsapp: true } })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const result = tasks.map((t) => ({
    ...t,
    assignedToUser: userMap[t.assignedTo] ?? null,
    assignedByUser: userMap[t.assignedBy] ?? null,
  }))

  return NextResponse.json({ tasks: result })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { title, description, assignedTo, dueDate, priority, whatsappReminder, reminderTime } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 })
  if (!dueDate) return NextResponse.json({ error: 'dueDate is required' }, { status: 400 })
  if (whatsappReminder && !reminderTime) return NextResponse.json({ error: 'reminderTime is required when WhatsApp reminder is enabled' }, { status: 400 })

  let warning: string | undefined
  if (whatsappReminder) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedTo }, select: { whatsapp: true } })
    if (!assignee?.whatsapp) warning = 'Assignee has no WhatsApp number — reminder saved but will not be sent'
  }

  const task = await prisma.task.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      title,
      description: description || null,
      assignedTo,
      assignedBy: userId,
      dueDate: new Date(dueDate),
      priority: priority || 'MEDIUM',
      whatsappReminder: !!whatsappReminder,
      reminderTime: reminderTime ? new Date(reminderTime) : null,
      updatedAt: new Date(),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'Tasks', recordId: task.id, newValues: { title, assignedTo, dueDate } })
  return NextResponse.json({ task, warning }, { status: 201 })
}
