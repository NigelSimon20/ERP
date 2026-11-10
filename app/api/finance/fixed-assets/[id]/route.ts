import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'
import { depreciateAssetForPeriod, requireDepreciationAccounts, periodOf } from '@/lib/fixed-assets'

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
    return apiError(err, 'Failed', 400)
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

  // P1-11: one month's straight-line charge, posted to the GL (Dr
  // Depreciation Expense / Cr Accumulated Depreciation), once per month.
  const period = new URL(req.url).searchParams.get('period') ?? periodOf(new Date())
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'period must be YYYY-MM', code: 'VALIDATION_ERROR' }, { status: 400 })
  let monthlyDep: number
  try {
    const accounts = await requireDepreciationAccounts(prisma, session.companyId)
    monthlyDep = await prisma.$transaction((tx) => depreciateAssetForPeriod(tx, asset, period, accounts, session.userId))
  } catch (err) {
    return apiError(err, 'Failed to depreciate', 400)
  }
  if (monthlyDep === 0) {
    return NextResponse.json({ error: `Nothing to depreciate for ${period} (already charged, fully depreciated, or bought later)`, code: 'NOTHING_TO_DEPRECIATE' }, { status: 409 })
  }
  const updated = await prisma.fixedAsset.findUniqueOrThrow({ where: { id: params.id } })
  const newAccumulated = Number(updated.accumulatedDepreciation)
  const newCurrentValue = Number(updated.currentValue)
  const newStatus = updated.status

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
