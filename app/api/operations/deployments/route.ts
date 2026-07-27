import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { createDeployment, DeploymentValidationError } from '@/lib/deployment-creation'
import type { DeploymentStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  const guardId = searchParams.get('guardId')
  const status = searchParams.get('status') as DeploymentStatus | null

  const deployments = await prisma.deployment.findMany({
    where: {
      companyId,
      ...(siteId ? { siteId } : {}),
      ...(guardId ? { guardId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { startDate: 'desc' },
  })

  const [guards, sites] = await Promise.all([
    prisma.guard.findMany({ where: { id: { in: deployments.map((d) => d.guardId) } }, select: { id: true, full_name: true, employee_code: true } }),
    prisma.site.findMany({ where: { id: { in: deployments.map((d) => d.siteId) } }, select: { id: true, site_name: true } }),
  ])
  const guardById = new Map(guards.map((g) => [g.id, g]))
  const siteById = new Map(sites.map((s) => [s.id, s]))

  return NextResponse.json({
    deployments: deployments.map((d) => ({
      ...d,
      guard: guardById.get(d.guardId) ? { name: guardById.get(d.guardId)!.full_name, employeeNumber: guardById.get(d.guardId)!.employee_code } : null,
      site: siteById.get(d.siteId) ? { name: siteById.get(d.siteId)!.site_name } : null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { guardId, siteId, shift, shiftType, startDate, endDate, hoursPerDay, ratePerHour } = body

  try {
    const deployment = await createDeployment({
      companyId, guardId, siteId, shiftType: shift || shiftType, startDate, endDate, hoursPerDay, ratePerHour,
    })

    await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Deployment', recordId: deployment.id, newValues: deployment })

    return NextResponse.json({ deployment }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof DeploymentValidationError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
