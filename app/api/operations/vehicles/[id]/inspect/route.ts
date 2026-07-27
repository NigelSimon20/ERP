import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const VALID_CONDITIONS = ['GOOD', 'NEEDS_ATTENTION', 'UNSAFE']

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const vehicle = await prisma.vehicle.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const inspections = await prisma.vehicleInspection.findMany({
    where: { vehicleId: params.id, companyId: session.companyId },
    orderBy: { inspectedAt: 'desc' },
  })
  return NextResponse.json({ inspections })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const vehicle = await prisma.vehicle.findFirst({ where: { id: params.id, companyId } })
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const condition = String(body.condition ?? 'GOOD').toUpperCase()
  if (!VALID_CONDITIONS.includes(condition)) {
    return NextResponse.json({ error: 'condition must be GOOD, NEEDS_ATTENTION, or UNSAFE' }, { status: 400 })
  }

  const inspection = await prisma.vehicleInspection.create({
    data: {
      companyId,
      vehicleId: params.id,
      inspectedBy: userId,
      odometer: body.odometer != null ? Number(body.odometer) : null,
      fuelLevel: body.fuelLevel || null,
      condition,
      defectsNoted: body.defectsNoted || null,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'VehicleInspection', recordId: inspection.id, newValues: inspection })
  return NextResponse.json({ inspection }, { status: 201 })
}
