import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGuardSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getGuardSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.guardId) return NextResponse.json({ deployments: [] })

  const deployments = await prisma.deployment.findMany({
    where: { guardId: session.guardId },
    orderBy: { startDate: 'desc' },
    select: { id: true, siteId: true, startDate: true, endDate: true, shiftType: true, status: true },
  })

  // Deployment.siteId is a plain scalar reference (no formal Prisma
  // relation on this model), so site names are resolved with a manual join.
  const siteIds = Array.from(new Set(deployments.map(d => d.siteId)))
  const sites = await prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, site_name: true } })
  const siteMap = Object.fromEntries(sites.map(s => [s.id, s.site_name]))

  return NextResponse.json({
    deployments: deployments.map(d => ({
      id: d.id,
      siteId: d.siteId,
      startDate: d.startDate.toISOString(),
      endDate: d.endDate ? d.endDate.toISOString() : null,
      shiftType: d.shiftType,
      status: d.status,
      site: { name: siteMap[d.siteId] ?? 'Unknown site' },
    })),
  })
}
