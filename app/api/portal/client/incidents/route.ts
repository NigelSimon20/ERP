import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getClientSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.customerId) return NextResponse.json({ incidents: [] })

  const siteIds = (
    await prisma.site.findMany({ where: { customer_id: session.customerId }, select: { id: true } })
  ).map(s => s.id)

  if (siteIds.length === 0) return NextResponse.json({ incidents: [] })

  const incidents = await prisma.incident.findMany({
    where: { siteId: { in: siteIds } },
    orderBy: { reportedAt: 'desc' },
    take: 25,
    select: { id: true, title: true, severity: true, status: true, reportedAt: true },
  })

  return NextResponse.json({
    incidents: incidents.map(i => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      reportedAt: i.reportedAt.toISOString(),
    })),
  })
}
