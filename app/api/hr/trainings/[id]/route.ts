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
    const training = await prisma.training.findFirst({
      where: { id: params.id, companyId: session.companyId },
      include: {
        participants: true,
      },
    })

    if (!training) return NextResponse.json({ error: 'Training not found' }, { status: 404 })
    return NextResponse.json(training)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.training.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!existing) return NextResponse.json({ error: 'Training not found' }, { status: 404 })

  const body = await req.json()
  const { title, description, category, trainer, location, startDate, endDate, durationHours, status, mandatory, notes } = body

  try {
    const updated = await prisma.training.update({
      where: { id: params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(category && { category }),
        ...(trainer !== undefined && { trainer: trainer || null }),
        ...(location !== undefined && { location: location || null }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(durationHours !== undefined && { durationHours: Number(durationHours) }),
        ...(status && { status }),
        ...(mandatory !== undefined && { mandatory }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      include: { participants: true },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'Training', recordId: updated.id,
      newValues: updated,
      oldValues: existing,
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.training.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!existing) return NextResponse.json({ error: 'Training not found' }, { status: 404 })

  try {
    await prisma.training.delete({ where: { id: params.id } })
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'DELETE',
      module: 'Training', recordId: existing.id,
      oldValues: existing,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
