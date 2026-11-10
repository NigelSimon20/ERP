import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { apiError, ApiError } from '@/lib/api-error'
import { assetAccounts, postAssetAcquisition } from '@/lib/fixed-assets'

const assetSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  purchaseDate: z.string(),
  purchasePrice: z.coerce.number().positive(),
  usefulLifeYears: z.coerce.number().positive(),
  // Omit for an asset already owned (credited to Opening Balance Equity).
  paidFromBankAccountId: z.string().min(1).optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assets = await prisma.fixedAsset.findMany({
    where: { companyId: session.companyId },
    orderBy: { purchaseDate: 'desc' },
  })

  return NextResponse.json({
    assets: assets.map((a) => ({
      ...a,
      purchasePrice: Number(a.purchasePrice),
      accumulatedDepreciation: Number(a.accumulatedDepreciation),
      currentValue: Number(a.currentValue),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = assetSchema.parse(await req.json())

    // P1-11: registering an asset posts it to the GL.
    const { fixedAssets } = await assetAccounts(prisma, session.companyId)
    if (!fixedAssets) throw new ApiError('Set the Fixed Assets account in Settings → Company → GL accounts.', 400, 'ACCOUNT_NOT_CONFIGURED')
    const bank = data.paidFromBankAccountId
      ? await prisma.bankAccount.findFirst({ where: { id: data.paidFromBankAccountId, companyId: session.companyId } })
      : null
    if (data.paidFromBankAccountId && !bank) throw new ApiError('Bank account not found', 404, 'NOT_FOUND')
    if (bank && !bank.chart_account_id) throw new ApiError('The selected bank account has no linked GL account', 400, 'BANK_NOT_LINKED')

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.fixedAsset.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          name: data.name,
          category: data.category,
          purchaseDate: new Date(data.purchaseDate),
          purchasePrice: data.purchasePrice,
          usefulLifeYears: data.usefulLifeYears,
          accumulatedDepreciation: 0,
          currentValue: data.purchasePrice,
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      })
      await postAssetAcquisition(tx, created, { fixedAssetsAccountId: fixedAssets, paidFromGlAccountId: bank?.chart_account_id ?? null, userId: session.userId })
      if (bank) await tx.bankAccount.update({ where: { id: bank.id }, data: { current_balance: { decrement: created.purchasePrice } } })
      return created
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'FixedAssets',
      recordId: asset.id,
      newValues: { name: data.name, purchasePrice: data.purchasePrice },
    })

    return NextResponse.json({ asset }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
