import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId')
  const onSiteOnly = searchParams.get('onSite') === 'true'

  const visitors = await prisma.visitorLog.findMany({
    where: {
      companyId,
      ...(siteId ? { siteId } : {}),
      ...(onSiteOnly ? { checkOut: null } : {}),
    },
    orderBy: { checkIn: 'desc' },
  })

  const sites = await prisma.site.findMany({ where: { id: { in: visitors.map((v) => v.siteId) } }, select: { id: true, site_name: true } })
  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.site_name]))

  return NextResponse.json({ visitors: visitors.map((v) => ({ ...v, siteName: siteMap[v.siteId] ?? null })) })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { siteId, visitorName, idNumber, companyVisited, hostName, vehicleReg, badgeNumber, notes } = body

  if (!siteId || !visitorName) return NextResponse.json({ error: 'siteId and visitorName are required' }, { status: 400 })

  const site = await prisma.site.findFirst({ where: { id: siteId, companyId } })
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

  const visitor = await prisma.visitorLog.create({
    data: {
      companyId,
      siteId,
      visitorName,
      idNumber: idNumber || null,
      companyVisited: companyVisited || null,
      hostName: hostName || null,
      vehicleReg: vehicleReg || null,
      badgeNumber: badgeNumber || null,
      notes: notes || null,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'VisitorLog', recordId: visitor.id, newValues: visitor })
  return NextResponse.json({ visitor }, { status: 201 })
}
