import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const accountSchema = z.object({
  accountCode: z.string().min(1, 'Code required'),
  name: z.string().min(1, 'Name required'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().min(1).optional().nullable(),
  active: z.boolean().default(true),
})

async function auth(req: NextRequest) {
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return session.isLoggedIn ? session : null
}

export async function GET(req: NextRequest) {
  const session = await auth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.chartOfAccount.findMany({
    where: { companyId: session.companyId },
    orderBy: { account_code: 'asc' },
  })

  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  const session = await auth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = accountSchema.parse(await req.json())

    const duplicate = await prisma.chartOfAccount.findFirst({
      where: { account_code: data.accountCode, companyId: session.companyId },
    })
    if (duplicate) return NextResponse.json({ error: 'Account code already in use' }, { status: 400 })

    const account = await prisma.chartOfAccount.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        account_code: data.accountCode,
        account_name: data.name,
        account_type: data.type,
        parent_account_id: data.parentId ?? null,
        current_balance: 0,
        is_active: data.active,
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'ChartOfAccounts',
      recordId: account.id,
      newValues: { accountCode: data.accountCode, name: data.name, type: data.type },
    })

    return NextResponse.json({ account }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
