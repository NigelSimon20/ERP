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

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyAccounts = await prisma.bankAccount.findMany({ where: { companyId: session.companyId }, select: { id: true } })
  const recs = await prisma.bankReconciliation.findMany({
    where: { bankAccountId: { in: companyAccounts.map((a) => a.id) } },
    orderBy: { reconcileDate: 'desc' },
  })

  return NextResponse.json({
    reconciliations: recs.map((r) => ({
      ...r,
      statementBalance: Number(r.statementBalance),
      bookBalance: Number(r.bookBalance),
      difference: Number(r.difference),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'close') {
    const body = await req.json()
    const { id } = body
    const rec = await prisma.bankReconciliation.findFirst({ where: { id } })
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const owningAccount = await prisma.bankAccount.findFirst({ where: { id: rec.bankAccountId, companyId: session.companyId } })
    if (!owningAccount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (Math.abs(Number(rec.difference)) > 0.01) {
      return NextResponse.json({ error: `Cannot close: outstanding difference of ${Number(rec.difference).toFixed(2)}` }, { status: 400 })
    }
    const updated = await prisma.bankReconciliation.update({ where: { id }, data: { status: 'RECONCILED' } })
    return NextResponse.json({ reconciliation: { ...updated, difference: Number(updated.difference), statementBalance: Number(updated.statementBalance), bookBalance: Number(updated.bookBalance) } })
  }

  // Create reconciliation
  const body = await req.json()
  const { bankAccountId, reconcileDate, statementBalance } = body
  const { companyId } = session

  if (!bankAccountId || !reconcileDate || statementBalance === undefined) {
    return NextResponse.json({ error: 'bankAccountId, reconcileDate, statementBalance required' }, { status: 400 })
  }

  const bankAccount = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
  if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

  const bookBalance = Number(bankAccount.current_balance)
  const stmtBalance = Number(statementBalance)
  const difference = stmtBalance - bookBalance

  const rec = await prisma.bankReconciliation.create({
    data: {
      id: crypto.randomUUID(),
      bankAccountId,
      reconcileDate: new Date(reconcileDate),
      statementBalance: stmtBalance,
      bookBalance,
      difference,
      status: 'OPEN',
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'BankReconciliation', recordId: rec.id })
  return NextResponse.json({ reconciliation: { ...rec, statementBalance: Number(rec.statementBalance), bookBalance: Number(rec.bookBalance), difference: Number(rec.difference) } }, { status: 201 })
}
