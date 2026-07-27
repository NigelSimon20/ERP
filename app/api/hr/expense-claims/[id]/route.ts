import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { postExpenseClaimToGL } from '@/lib/gl-posting'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.expenseClaim.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve' || action === 'reject') {
    if (!['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'HR_MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.userId === userId) return NextResponse.json({ error: 'You cannot approve or reject your own expense claim' }, { status: 400 })
    if (existing.status !== 'PENDING') return NextResponse.json({ error: 'Expense claim is no longer pending' }, { status: 409 })

    if (action === 'approve') {
      const { count } = await prisma.expenseClaim.updateMany({ where: { id: params.id, status: 'PENDING' }, data: { status: 'APPROVED', approvedBy: userId } })
      if (count === 0) return NextResponse.json({ error: 'Expense claim is no longer pending' }, { status: 409 })
      const updated = await prisma.expenseClaim.findUniqueOrThrow({ where: { id: params.id } })
      await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'ExpenseClaim', recordId: params.id, oldValues: { status: 'PENDING' }, newValues: { status: 'APPROVED' } })
      return NextResponse.json({ expenseClaim: updated })
    }

    const { rejectionNote } = await req.json().catch(() => ({}))
    const { count } = await prisma.expenseClaim.updateMany({ where: { id: params.id, status: 'PENDING' }, data: { status: 'REJECTED', rejectionNote: rejectionNote || null, approvedBy: userId } })
    if (count === 0) return NextResponse.json({ error: 'Expense claim is no longer pending' }, { status: 409 })
    const updated = await prisma.expenseClaim.findUniqueOrThrow({ where: { id: params.id } })
    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'ExpenseClaim', recordId: params.id, oldValues: { status: 'PENDING' }, newValues: { status: 'REJECTED', rejectionNote } })
    return NextResponse.json({ expenseClaim: updated })
  }

  if (action === 'mark-paid') {
    if (!['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.status !== 'APPROVED') return NextResponse.json({ error: 'Only APPROVED expense claims can be marked paid' }, { status: 409 })

    const body = await req.json().catch(() => ({}))
    const [expenseAccount, bankAccount] = await Promise.all([
      prisma.chartOfAccount.findFirst({ where: { id: body.expenseAccountId, companyId, account_type: 'EXPENSE' } }),
      prisma.bankAccount.findFirst({ where: { id: body.bankAccountId, companyId } }),
    ])
    if (!expenseAccount) return NextResponse.json({ error: 'A valid expense account (expenseAccountId) is required to mark this claim paid' }, { status: 400 })
    if (!bankAccount) return NextResponse.json({ error: 'A valid bank account (bankAccountId) is required to mark this claim paid' }, { status: 400 })
    const bankGlAccountId = bankAccount.chart_account_id
    if (!bankGlAccountId) return NextResponse.json({ error: 'The selected bank account has no linked GL account' }, { status: 400 })

    const claimed = await prisma.expenseClaim.updateMany({ where: { id: params.id, status: 'APPROVED' }, data: { status: 'PAID', paidAt: new Date() } })
    if (claimed.count === 0) return NextResponse.json({ error: 'Expense claim is no longer APPROVED' }, { status: 409 })

    const updated = await prisma.$transaction(async (tx) => {
      await postExpenseClaimToGL(tx, {
        companyId, expenseClaimId: existing.id, claimNumber: existing.claimNumber,
        entryDate: new Date().toISOString(), amount: existing.amount,
        expenseAccountId: expenseAccount.id, bankAccountId: bankGlAccountId, userId,
      })
      return tx.expenseClaim.findUniqueOrThrow({ where: { id: params.id } })
    })

    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'ExpenseClaim', recordId: params.id, oldValues: { status: 'APPROVED' }, newValues: { status: 'PAID' } })
    return NextResponse.json({ expenseClaim: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
