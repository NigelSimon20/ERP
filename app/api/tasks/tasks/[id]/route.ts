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
  const existing = await prisma.task.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canEdit = userId === existing.assignedBy || userId === existing.assignedTo || ['SUPER_ADMIN', 'ADMIN'].includes(session.role)
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { title, description, assignedTo, dueDate, priority, status, whatsappReminder, reminderTime } = body

  const newStatus = status ?? existing.status
  const isCompleting = newStatus === 'COMPLETED' && existing.status !== 'COMPLETED'

  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...(title ? { title } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
      ...(isCompleting ? { completedAt: new Date() } : {}),
      ...(whatsappReminder !== undefined ? { whatsappReminder: !!whatsappReminder } : {}),
      ...(reminderTime !== undefined ? { reminderTime: reminderTime ? new Date(reminderTime) : null } : {}),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Tasks', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: task.status } })
  return NextResponse.json({ task })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.task.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const canDelete = userId === existing.assignedBy || ['SUPER_ADMIN', 'ADMIN'].includes(session.role)
  if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.task.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name, action: 'DELETE', module: 'Tasks', recordId: params.id, oldValues: { title: existing.title } })
  return NextResponse.json({ success: true })
}
