import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { calculateStraightLineDepreciation } from '@/lib/calculations'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  serialNumber: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISPOSED', 'SOLD']).optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const asset = await prisma.fixedAsset.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    asset: {
      ...asset,
      purchasePrice: Number(asset.purchasePrice),
      accumulatedDepreciation: Number(asset.accumulatedDepreciation),
      currentValue: Number(asset.currentValue),
    },
  })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const asset = await prisma.fixedAsset.findFirst({
      where: { id: params.id, companyId: session.companyId },
    })
    if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data = updateSchema.parse(await req.json())

    const updated = await prisma.fixedAsset.update({
      where: { id: params.id },
      data: { ...data, updatedAt: new Date() },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'FixedAssets',
      recordId: params.id,
      oldValues: { name: asset.name },
      newValues: data,
    })

    return NextResponse.json({ asset: updated })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const action = new URL(req.url).searchParams.get('action')
  if (action !== 'depreciate') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const asset = await prisma.fixedAsset.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (asset.status === 'DISPOSED') {
    return NextResponse.json({ error: 'Asset is already disposed' }, { status: 400 })
  }

  const monthlyDep = calculateStraightLineDepreciation(
    Number(asset.purchasePrice),
    Number(asset.usefulLifeYears),
  )

  const newAccumulated = Number(asset.accumulatedDepreciation) + monthlyDep
  const rawCurrentValue = Number(asset.purchasePrice) - newAccumulated
  const newCurrentValue = Math.max(0, rawCurrentValue)
  const newStatus = newCurrentValue <= 0 ? 'DISPOSED' : asset.status

  const updated = await prisma.fixedAsset.update({
    where: { id: params.id },
    data: {
      accumulatedDepreciation: newAccumulated,
      currentValue: newCurrentValue,
      status: newStatus,
      updatedAt: new Date(),
    },
  })

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'UPDATE',
    module: 'FixedAssets',
    recordId: params.id,
    newValues: { monthlyDep, newAccumulated, newCurrentValue, newStatus },
  })

  return NextResponse.json({
    asset: {
      ...updated,
      purchasePrice: Number(updated.purchasePrice),
      accumulatedDepreciation: Number(updated.accumulatedDepreciation),
      currentValue: Number(updated.currentValue),
    },
    monthlyDep,
  })
}
