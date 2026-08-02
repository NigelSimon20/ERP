import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session

  const leads = await prisma.lead.findMany({
    where: { companyId },
    include: { assignedUser: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const activeLeads = leads.filter((l) => !['WON', 'LOST'].includes(l.status))
  const pipelineValue = activeLeads.reduce((s, l) => s + Number(l.estimatedValue ?? 0) * (Number(l.probability ?? 0) / 100), 0)
  const totalPipeline = activeLeads.reduce((s, l) => s + Number(l.estimatedValue ?? 0), 0)

  return NextResponse.json({ leads, pipelineValue: Math.round(pipelineValue * 100) / 100, totalPipeline: Math.round(totalPipeline * 100) / 100 })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { companyName, contactName, contactEmail, contactPhone, source, status, estimatedValue, probability, assignedUserId, notes } = body

  if (!companyName || !contactName || !contactPhone) {
    return NextResponse.json({ error: 'companyName, contactName, and contactPhone are required' }, { status: 400 })
  }

  const lead = await prisma.lead.create({
    data: {
      id: crypto.randomUUID(), companyId,
      companyName, contactName, contactEmail: contactEmail || null,
      contactPhone, source: source || null,
      status: status || 'NEW',
      estimatedValue: estimatedValue != null ? Number(estimatedValue) : 0,
      probability: probability != null ? Number(probability) : 0,
      assignedTo: assignedUserId || null, notes: notes || null,
      updatedAt: new Date(),
    },
    include: { assignedUser: { select: { id: true, name: true } } },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'CREATE', module: 'BD', recordId: lead.id, newValues: lead })
  return NextResponse.json({ lead }, { status: 201 })
}
