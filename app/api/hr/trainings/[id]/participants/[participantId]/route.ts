import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'

export async function PUT(req: NextRequest, { params }: { params: { id: string; participantId: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const participant = await prisma.trainingParticipant.findUnique({
    where: { id: params.participantId },
  })
  if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })

  const body = await req.json()
  const { attendance, score, passed, notes } = body

  try {
    const updated = await prisma.trainingParticipant.update({
      where: { id: params.participantId },
      data: {
        ...(attendance && { attendance }),
        ...(score !== undefined && { score: score ? Number(score) : null }),
        ...(passed !== undefined && { passed }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'TrainingParticipant', recordId: updated.id,
      newValues: updated,
      oldValues: participant,
    })

    return NextResponse.json(updated)
  } catch (err: any) {
    return apiError(err, 'Request failed', 400)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; participantId: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const participant = await prisma.trainingParticipant.findUnique({
    where: { id: params.participantId },
  })
  if (!participant) return NextResponse.json({ error: 'Participant not found' }, { status: 404 })

  try {
    await prisma.trainingParticipant.delete({ where: { id: params.participantId } })
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'DELETE',
      module: 'TrainingParticipant', recordId: participant.id,
      oldValues: participant,
    })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return apiError(err, 'Request failed', 500)
  }
}
