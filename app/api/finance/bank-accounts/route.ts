import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'

const createSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountType: z.string().min(1),
  currency: z.string().length(3).default('USD'),
  openingBalance: z.coerce.number().default(0),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.bankAccount.findMany({
    where: { companyId: session.companyId },
    orderBy: { bank_name: 'asc' },
  })

  const ids = accounts.map((a) => a.id)

  const [receiptAggs, paymentAggs] = await Promise.all([
    prisma.payment.groupBy({
      by: ['bank_account_id'],
      where: { bank_account_id: { in: ids }, companyId: session.companyId, payment_type: 'Customer Receipt' },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['bank_account_id'],
      where: { bank_account_id: { in: ids }, payment_type: { not: 'Customer Receipt' } },
      _sum: { amount: true },
    }),
  ])

  const receiptMap = Object.fromEntries(
    receiptAggs.map((r) => [r.bank_account_id, Number(r._sum.amount ?? 0)]),
  )
  const paymentMap = Object.fromEntries(
    paymentAggs.map((p) => [p.bank_account_id, Number(p._sum.amount ?? 0)]),
  )

  const result = accounts.map((a) => ({
    ...a,
    bankName: a.bank_name,
    accountNumber: a.account_number,
    accountType: a.account_type,
    openingBalance: Number(a.opening_balance),
    currentBalance: Number(a.current_balance),
    calculatedBalance:
      Number(a.opening_balance) + (receiptMap[a.id] ?? 0) - (paymentMap[a.id] ?? 0),
  }))

  return NextResponse.json({ accounts: result })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = createSchema.parse(await req.json())

    const account = await prisma.bankAccount.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        bank_name: data.bankName,
        account_number: data.accountNumber,
        account_type: data.accountType,
        currency: data.currency,
        opening_balance: data.openingBalance,
        current_balance: data.openingBalance,
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'BankAccounts',
      recordId: account.id,
      newValues: { bankName: data.bankName, accountNumber: data.accountNumber },
    })

    return NextResponse.json({ account }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
