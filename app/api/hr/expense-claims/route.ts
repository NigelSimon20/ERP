import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate, pageLimit } from '@/lib/utils'
import { nextExpenseClaimNumber } from '@/lib/auto-numbers'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const userId = searchParams.get('userId') || undefined
  const page = Number(searchParams.get('page') ?? '1')

  const where: any = { companyId: session.companyId, ...(status && { status }), ...(userId && { userId }) }

  const [rows, total] = await Promise.all([
    prisma.expenseClaim.findMany({ where, orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }], ...paginate(page, pageLimit(searchParams)) }),
    prisma.expenseClaim.count({ where }),
  ])

  const userIds = Array.from(new Set(rows.map((r) => r.userId)))
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  return NextResponse.json({
    expenseClaims: rows.map((r) => ({ ...r, submittedBy: { id: r.userId, name: userMap[r.userId] ?? '' } })),
    total,
    page,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { category, amount, currency, expenseDate, description, receiptFileId } = body
  if (!category || !amount || !expenseDate || !description) {
    return NextResponse.json({ error: 'category, amount, expenseDate, description required' }, { status: 400 })
  }
  if (Number(amount) <= 0) return NextResponse.json({ error: 'amount must be greater than zero' }, { status: 400 })

  const claimNumber = await nextExpenseClaimNumber(session.companyId)

  const claim = await prisma.expenseClaim.create({
    data: {
      companyId: session.companyId, userId: session.userId, claimNumber,
      category, amount: Number(amount), currency: currency || 'USD',
      expenseDate: new Date(expenseDate), description, receiptFileId: receiptFileId || null,
    },
  })

  await logAudit({
    companyId: session.companyId, userId: session.userId, userName: session.name,
    action: 'CREATE', module: 'ExpenseClaim', recordId: claim.id,
    newValues: { claimNumber, category, amount },
  })

  return NextResponse.json({ expenseClaim: claim }, { status: 201 })
}
