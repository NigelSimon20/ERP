import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.bankAccount.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [receiptsTotal, paymentsTotal] = await Promise.all([
    prisma.payment.aggregate({ where: { bank_account_id: params.id, payment_type: 'Customer Receipt' }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { bank_account_id: params.id, payment_type: { not: 'Customer Receipt' } }, _sum: { amount: true } }),
  ])

  return NextResponse.json({
    account: {
      ...account,
      currentBalance: Number(account.current_balance),
      openingBalance: Number(account.opening_balance),
    },
    receiptsTotal: Number(receiptsTotal._sum.amount ?? 0),
    paymentsTotal: Number(paymentsTotal._sum.amount ?? 0),
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.bankAccount.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { bankName, accountNumber, accountType, currency, active } = body

  const updated = await prisma.bankAccount.update({
    where: { id: params.id },
    data: { bank_name: bankName, account_number: accountNumber, account_type: accountType, currency, is_active: active },
  })
  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'UPDATE',
    module: 'BankAccount',
    recordId: params.id,
    oldValues: account,
    newValues: updated,
  })
  return NextResponse.json({ account: { ...updated, currentBalance: Number(updated.current_balance), openingBalance: Number(updated.opening_balance) } })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.bankAccount.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [payments, receipts, transfersFrom, transfersTo] = await Promise.all([
    prisma.payment.count({ where: { bank_account_id: params.id, payment_type: { not: 'Customer Receipt' } } }),
    prisma.payment.count({ where: { bank_account_id: params.id, payment_type: 'Customer Receipt' } }),
    prisma.bankTransfer.count({ where: { fromAccountId: params.id } }),
    prisma.bankTransfer.count({ where: { toAccountId: params.id } }),
  ])

  if (payments + receipts + transfersFrom + transfersTo > 0) {
    return NextResponse.json({ error: 'Cannot delete: account has associated transactions' }, { status: 400 })
  }

  await prisma.bankAccount.delete({ where: { id: params.id } })
  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'DELETE',
    module: 'BankAccount',
    recordId: params.id,
  })
  return NextResponse.json({ success: true })
}
