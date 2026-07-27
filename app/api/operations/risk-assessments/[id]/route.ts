import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assessment = await prisma.riskAssessment.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!assessment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const site = await prisma.site.findUnique({ where: { id: assessment.siteId }, select: { id: true, site_name: true } })
  return NextResponse.json({ riskAssessment: { ...assessment, site: site ? { id: site.id, name: site.site_name } : null } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.riskAssessment.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { status, findings, mitigationPlan, reviewDate } = body
  const updated = await prisma.riskAssessment.update({
    where: { id: params.id },
    data: {
      ...(status ? { status } : {}),
      ...(findings !== undefined ? { findings } : {}),
      ...(mitigationPlan !== undefined ? { mitigationPlan } : {}),
      ...(reviewDate !== undefined ? { reviewDate: reviewDate ? new Date(reviewDate) : null } : {}),
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'RiskAssessment', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: updated.status } })
  return NextResponse.json({ riskAssessment: updated })
}
