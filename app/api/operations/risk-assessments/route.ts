import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'
import type { Severity, ReportStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  const status = searchParams.get('status') as ReportStatus | null
  const page = Number(searchParams.get('page') ?? 1)
  const { skip, take } = paginate(page)

  const where = { companyId, ...(siteId ? { siteId } : {}), ...(status ? { status } : {}) }

  const [rows, total] = await Promise.all([
    prisma.riskAssessment.findMany({ where, orderBy: { assessedAt: 'desc' }, skip, take }),
    prisma.riskAssessment.count({ where }),
  ])

  const sites = await prisma.site.findMany({ where: { id: { in: rows.map((r) => r.siteId) } }, select: { id: true, site_name: true } })
  const siteById = new Map(sites.map((s) => [s.id, s]))

  return NextResponse.json({
    riskAssessments: rows.map((r) => ({ ...r, site: siteById.get(r.siteId) ? { id: r.siteId, name: siteById.get(r.siteId)!.site_name } : null })),
    total, page, pages: Math.ceil(total / take),
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { siteId, category, likelihood, impact, riskRating, findings, mitigationPlan, reviewDate } = body

  if (!siteId || !category || !findings || !mitigationPlan) {
    return NextResponse.json({ error: 'siteId, category, findings, mitigationPlan are required' }, { status: 400 })
  }

  const site = await prisma.site.findFirst({ where: { id: siteId, companyId } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const assessment = await prisma.riskAssessment.create({
    data: {
      companyId, siteId, assessedBy: userName,
      category, likelihood: (likelihood as Severity) || 'MEDIUM', impact: (impact as Severity) || 'MEDIUM',
      riskRating: (riskRating as Severity) || 'MEDIUM',
      findings, mitigationPlan, reviewDate: reviewDate ? new Date(reviewDate) : null,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'RiskAssessment', recordId: assessment.id, newValues: { siteId, category, riskRating: assessment.riskRating } })

  return NextResponse.json({ riskAssessment: assessment }, { status: 201 })
}
