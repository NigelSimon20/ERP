import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, companyId } = session
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  const existing = await prisma.coverageRequest.findFirst({
    where: { id: params.id, companyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ((action === 'approve' || action === 'reject') && !['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if ((action === 'approve' || action === 'reject') && existing.status !== 'PENDING') {
    return NextResponse.json({ error: `Request already ${existing.status.toLowerCase()}` }, { status: 400 })
  }

  if (action === 'approve') {
    const request = await prisma.coverageRequest.update({
      where: { id: params.id },
      data: { status: 'APPROVED', approvedBy: userId },
    })

    await logAudit({
      companyId: session.companyId,
      userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'CoverageRequest',
      recordId: request.id,
      oldValues: { status: existing.status },
      newValues: { status: 'APPROVED' },
    })

    const requestedByUser = await prisma.user.findUnique({ where: { id: existing.requestedBy } })
    if (requestedByUser) {
      await prisma.notification.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          userId: requestedByUser.id,
          type: 'COVERAGE_REQUEST_APPROVED',
          title: 'Coverage Request Approved',
          message: `Your coverage request has been approved.`,
          link: `/operations/coverage-requests/${request.id}`,
          read: false,
        },
      })

      if (requestedByUser.whatsapp) {
        fetch(process.env.WHATSAPP_WEBHOOK_URL ?? '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: requestedByUser.whatsapp,
            message: `Your coverage request has been approved by management.`,
          }),
        }).catch(() => {
          /* non-blocking */
        })
      }
    }

    return NextResponse.json({ request })
  }

  if (action === 'reject') {
    const body = await req.json()
    const { rejectionReason } = body

    const request = await prisma.coverageRequest.update({
      where: { id: params.id },
      data: { status: 'REJECTED', rejectionReason: rejectionReason || null },
    })

    await logAudit({
      companyId: session.companyId,
      userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'CoverageRequest',
      recordId: request.id,
      oldValues: { status: existing.status },
      newValues: { status: 'REJECTED', rejectionReason },
    })

    const requestedByUser = await prisma.user.findUnique({ where: { id: existing.requestedBy } })
    if (requestedByUser) {
      await prisma.notification.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          userId: requestedByUser.id,
          type: 'COVERAGE_REQUEST_REJECTED',
          title: 'Coverage Request Rejected',
          message: `Your coverage request was rejected${rejectionReason ? `: ${rejectionReason}` : ''}.`,
          link: `/operations/coverage-requests/${request.id}`,
          read: false,
        },
      })
    }

    return NextResponse.json({ request })
  }

  const body = await req.json()
  const request = await prisma.coverageRequest.update({
    where: { id: params.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      ...(body.guardsNeeded != null ? { requiredGuards: Number(body.guardsNeeded) } : {}),
      ...(body.rejectionReason !== undefined ? { rejectionReason: body.rejectionReason || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
    },
  })

  await logAudit({
    companyId: session.companyId,
    userId,
    userName: session.name,
    action: 'UPDATE',
    module: 'CoverageRequest',
    recordId: request.id,
    oldValues: existing,
    newValues: request,
  })

  return NextResponse.json({ request })
}
