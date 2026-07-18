import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { toSiteDto } from '@/lib/sites'
import crypto from 'crypto'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const site = await prisma.site.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const deployments = await prisma.deployment.findMany({ where: { companyId: session.companyId, siteId: params.id, status: 'ACTIVE' } })
  const guards = await prisma.guard.findMany({ where: { id: { in: deployments.map((d) => d.guardId) } } })
  const guardById = new Map(guards.map((g) => [g.id, g]))

  return NextResponse.json({
    site: {
      ...toSiteDto(site, deployments.length),
      deployments: deployments.map((d) => ({
        id: d.id,
        guard: { name: guardById.get(d.guardId)?.full_name ?? null, employeeNumber: guardById.get(d.guardId)?.employee_code ?? null },
        shift: d.shiftType,
        startDate: d.startDate,
      })),
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.site.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, customerId, address, guardsRequired, contractStart, contractEnd, status } = body

  if (contractStart && contractEnd && new Date(contractEnd) <= new Date(contractStart)) {
    return NextResponse.json({ error: 'Contract end must be after start' }, { status: 400 })
  }
  const site = await prisma.site.update({
    where: { id: params.id },
    data: {
      site_name: name ?? existing.site_name,
      customer_id: customerId !== undefined ? customerId || null : existing.customer_id,
      address: address !== undefined ? address || null : existing.address,
      day_shift_required: guardsRequired != null ? Number(guardsRequired) : existing.day_shift_required,
      contract_start_date: contractStart ?? existing.contract_start_date,
      contract_end_date: contractEnd ?? existing.contract_end_date,
      status: status ?? existing.status,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Site', recordId: site.id, oldValues: existing, newValues: site })
  return NextResponse.json({ site: toSiteDto(site) })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const site = await prisma.site.findFirst({ where: { id: params.id, companyId } })
  if (!site) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const activeCount = await prisma.deployment.count({ where: { companyId, siteId: params.id, status: 'ACTIVE' } })
  if (activeCount > 0) {
    return NextResponse.json({ error: `Cannot delete: ${activeCount} active deployment(s) at this site` }, { status: 409 })
  }

  await prisma.site.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName, action: 'DELETE', module: 'Site', recordId: params.id, oldValues: site })
  return NextResponse.json({ success: true })
}
