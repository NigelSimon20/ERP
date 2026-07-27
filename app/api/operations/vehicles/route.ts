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
  const status = searchParams.get('status')

  const vehicles = await prisma.vehicle.findMany({
    where: { companyId, ...(status ? { status } : {}) },
    orderBy: { registrationNumber: 'asc' },
  })

  const [sites, guards] = await Promise.all([
    prisma.site.findMany({ where: { id: { in: vehicles.map((v) => v.assignedSiteId).filter((v): v is string => !!v) } }, select: { id: true, site_name: true } }),
    prisma.guard.findMany({ where: { id: { in: vehicles.map((v) => v.assignedGuardId).filter((v): v is string => !!v) } }, select: { id: true, full_name: true } }),
  ])
  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s.site_name]))
  const guardMap = Object.fromEntries(guards.map((g) => [g.id, g.full_name]))

  return NextResponse.json({
    vehicles: vehicles.map((v) => ({
      ...v,
      siteName: v.assignedSiteId ? siteMap[v.assignedSiteId] ?? null : null,
      guardName: v.assignedGuardId ? guardMap[v.assignedGuardId] ?? null : null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { registrationNumber, make, model, assignedSiteId, assignedGuardId } = body

  if (!registrationNumber) return NextResponse.json({ error: 'Registration number is required' }, { status: 400 })

  const vehicle = await prisma.vehicle.create({
    data: {
      companyId,
      registrationNumber,
      make: make || null,
      model: model || null,
      assignedSiteId: assignedSiteId || null,
      assignedGuardId: assignedGuardId || null,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Vehicle', recordId: vehicle.id, newValues: vehicle })
  return NextResponse.json({ vehicle }, { status: 201 })
}
