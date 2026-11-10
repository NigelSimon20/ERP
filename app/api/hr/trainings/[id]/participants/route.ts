import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const training = await prisma.training.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!training) return NextResponse.json({ error: 'Training not found' }, { status: 404 })

  const body = await req.json()
  const { guardIds } = body

  if (!guardIds || !Array.isArray(guardIds)) {
    return NextResponse.json({ error: 'guardIds array is required' }, { status: 400 })
  }

  try {
    const existing = await prisma.trainingParticipant.findMany({
      where: { trainingId: params.id },
      select: { guardId: true },
    })
    const existingIds = existing.map((p) => p.guardId)
    const newIds = guardIds.filter((id: string) => !existingIds.includes(id))

    const participants = await prisma.trainingParticipant.createMany({
      data: newIds.map((guardId: string) => ({
        id: crypto.randomUUID(),
        trainingId: params.id,
        guardId,
        attendance: 'REGISTERED',
      })),
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'TrainingParticipants', recordId: params.id,
      newValues: { addedParticipants: newIds.length },
    })

    return NextResponse.json({ participants })
  } catch (err: any) {
    return apiError(err, 'Request failed', 400)
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const participants = await prisma.trainingParticipant.findMany({
      where: { trainingId: params.id },
    })

    return NextResponse.json(participants)
  } catch (err: any) {
    return apiError(err, 'Request failed', 500)
  }
}
