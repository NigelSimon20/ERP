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
  const requestType = searchParams.get('requestType')
  const myRequests = searchParams.get('myRequests') === 'true'
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const requests = await prisma.request.findMany({
    where: {
      companyId,
      ...(myRequests ? { requestedBy: userId } : {}),
      ...(status ? { status: status as 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED' } : {}),
      ...(requestType ? { requestType } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  const userIds = Array.from(new Set(requests.flatMap((r) => [r.requestedBy, r.assignedTo].filter(Boolean) as string[])))
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, whatsapp: true } })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const result = requests.map((r) => ({
    ...r,
    requestedByUser: userMap[r.requestedBy] ?? null,
    assignedToUser: r.assignedTo ? (userMap[r.assignedTo] ?? null) : null,
  }))

  return NextResponse.json({ requests: result })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { requestType, title, description, assignedTo, priority, whatsappReminder, reminderTime } = body

  if (!requestType?.trim()) return NextResponse.json({ error: 'requestType is required' }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!description?.trim()) return NextResponse.json({ error: 'description is required' }, { status: 400 })
  if (whatsappReminder && !reminderTime) return NextResponse.json({ error: 'reminderTime is required when WhatsApp reminder is enabled' }, { status: 400 })

  let warning: string | undefined
  if (whatsappReminder && assignedTo) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedTo }, select: { whatsapp: true } })
    if (!assignee?.whatsapp) warning = 'Assignee has no WhatsApp number — reminder saved but will not be sent'
  }

  const request = await prisma.request.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      requestType,
      title,
      description,
      requestedBy: userId,
      assignedTo: assignedTo || null,
      priority: priority || 'MEDIUM',
      whatsappReminder: !!whatsappReminder,
      reminderTime: reminderTime ? new Date(reminderTime) : null,
      updatedAt: new Date(),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'Requests', recordId: request.id, newValues: { requestType, title } })
  return NextResponse.json({ request, warning }, { status: 201 })
}
