import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inspection = await prisma.siteInspection.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const site = await prisma.site.findUnique({ where: { id: inspection.siteId }, select: { id: true, site_name: true } })
  return NextResponse.json({ siteInspection: { ...inspection, checklist: JSON.parse(inspection.checklist), site: site ? { id: site.id, name: site.site_name } : null } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.siteInspection.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { status, correctiveActions } = body
  const updated = await prisma.siteInspection.update({
    where: { id: params.id },
    data: { ...(status ? { status } : {}), ...(correctiveActions !== undefined ? { correctiveActions: correctiveActions || null } : {}) },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'SiteInspection', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: updated.status } })
  return NextResponse.json({ siteInspection: { ...updated, checklist: JSON.parse(updated.checklist) } })
}
