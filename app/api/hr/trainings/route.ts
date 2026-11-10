import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const category = searchParams.get('category')
  const page = Number(searchParams.get('page') ?? 1)
  const limit = Number(searchParams.get('limit') ?? 10)

  const where: any = { companyId: session.companyId }
  if (status) where.status = status
  if (category) where.category = category

  const [trainings, total] = await Promise.all([
    prisma.training.findMany({
      where,
      include: { participants: { select: { id: true, guardId: true, attendance: true, score: true, passed: true } } },
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.training.count({ where }),
  ])

  return NextResponse.json({
    trainings,
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, category, trainer, location, startDate, endDate, durationHours, mandatory, notes, participants } = body

  if (!title || !category || !startDate || !endDate) {
    return NextResponse.json({ error: 'title, category, startDate, endDate are required' }, { status: 400 })
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end <= start) {
    return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })
  }

  try {
    const training = await prisma.training.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        title,
        description: description || null,
        category,
        trainer: trainer || null,
        location: location || null,
        startDate: start,
        endDate: end,
        durationHours: Number(durationHours) || 0,
        status: 'SCHEDULED',
        mandatory: mandatory ?? false,
        notes: notes || null,
        participants: participants && participants.length > 0 ? {
          create: participants.map((guardId: string) => ({
            id: crypto.randomUUID(),
            guardId,
            attendance: 'REGISTERED',
          })),
        } : undefined,
      },
      include: { participants: true },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'Training', recordId: training.id,
      newValues: training,
    })

    return NextResponse.json(training, { status: 201 })
  } catch (err: any) {
    console.error('Training creation error:', err)
    return apiError(err, 'Failed to create training', 400)
  }
}
