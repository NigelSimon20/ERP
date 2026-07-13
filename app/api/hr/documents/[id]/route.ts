import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const doc = await prisma.hRDocument.findFirst({
      where: { id: params.id, companyId: session.companyId },
    })

    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    return NextResponse.json(doc)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.hRDocument.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const body = await req.json()
  const { guardId, documentType, title, expiryDate, notes } = body

  try {
    const updated = await prisma.hRDocument.update({
      where: { id: params.id },
      data: {
        ...(guardId !== undefined && { guardId: guardId || null }),
        ...(documentType && { documentType }),
        ...(title && { title }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'HRDocuments',
      recordId: updated.id,
      newValues: updated as any,
      oldValues: existing as any,
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.hRDocument.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  try {
    await prisma.hRDocument.delete({ where: { id: params.id } })
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'DELETE',
      module: 'HRDocuments',
      recordId: existing.id,
      oldValues: existing as any,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
