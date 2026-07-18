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

  const existing = await prisma.request.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve' || action === 'reject') {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.requestedBy === userId) {
      return NextResponse.json({ error: 'You cannot approve or reject your own request' }, { status: 400 })
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Request is no longer pending' }, { status: 409 })
    }
  }

  if (action === 'approve') {
    const request = await prisma.request.update({
      where: { id: params.id },
      data: { status: 'APPROVED' },
    })

    await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: existing.requestedBy,
        companyId,
        title: 'Request Approved',
        message: `Your request "${existing.title}" has been approved`,
        type: 'REQUEST_APPROVED',
        link: '/tasks-requests/requests',
      },
    })

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Requests', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'APPROVED' } })
    return NextResponse.json({ request })
  }

  if (action === 'reject') {
    const body = await req.json()
    const { approvalNote } = body
    if (!approvalNote?.trim()) return NextResponse.json({ error: 'approvalNote is required when rejecting' }, { status: 400 })

    const request = await prisma.request.update({
      where: { id: params.id },
      data: { status: 'REJECTED', approvalNote },
    })

    await prisma.notification.create({
      data: {
        id: crypto.randomUUID(),
        userId: existing.requestedBy,
        companyId,
        title: 'Request Rejected',
        message: `Your request "${existing.title}" was not approved. Note: ${approvalNote}`,
        type: 'REQUEST_REJECTED',
        link: '/tasks-requests/requests',
      },
    })

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Requests', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'REJECTED', approvalNote } })
    return NextResponse.json({ request })
  }

  // Generic update
  const body = await req.json()
  const { status, assignedTo, priority, whatsappReminder, reminderTime } = body

  const request = await prisma.request.update({
    where: { id: params.id },
    data: {
      ...(status ? { status } : {}),
      ...(assignedTo !== undefined ? { assignedTo: assignedTo || null } : {}),
      ...(priority ? { priority } : {}),
      ...(whatsappReminder !== undefined ? { whatsappReminder: !!whatsappReminder } : {}),
      ...(reminderTime !== undefined ? { reminderTime: reminderTime ? new Date(reminderTime) : null } : {}),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Requests', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: request.status } })
  return NextResponse.json({ request })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.request.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.request.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name, action: 'DELETE', module: 'Requests', recordId: params.id, oldValues: { title: existing.title } })
  return NextResponse.json({ success: true })
}
