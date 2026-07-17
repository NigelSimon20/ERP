import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
  parentId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
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

  const account = await prisma.chartOfAccount.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })

  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ account })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const account = await prisma.chartOfAccount.findFirst({
      where: { id: params.id, companyId: session.companyId },
    })
    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data = updateSchema.parse(await req.json())

    if (data.type && data.type !== account.account_type) {
      const posted = await prisma.journalLine.count({
        where: { accountId: params.id },
      })
      if (posted > 0) {
        return NextResponse.json(
          { error: 'Cannot change type — account has posted journal entries' },
          { status: 400 },
        )
      }
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id: params.id },
      data: {
        account_name: data.name,
        account_type: data.type,
        parent_account_id: data.parentId,
        is_active: data.active,
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'ChartOfAccounts',
      recordId: params.id,
      oldValues: { name: account.account_name, type: account.account_type, active: account.is_active },
      newValues: data,
    })

    return NextResponse.json({ account: updated })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.chartOfAccount.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lines = await prisma.journalLine.count({ where: { accountId: params.id } })
  if (lines > 0) {
    return NextResponse.json({ error: 'Cannot delete — account has journal entry lines' }, { status: 400 })
  }

  await prisma.chartOfAccount.delete({ where: { id: params.id } })

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'DELETE',
    module: 'ChartOfAccounts',
    recordId: params.id,
    oldValues: { accountCode: account.account_code, name: account.account_name },
  })

  return NextResponse.json({ success: true })
}
