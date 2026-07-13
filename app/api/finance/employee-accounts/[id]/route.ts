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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.employeeAccount.findFirst({ where: { id: params.id } })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ownerGuard = await prisma.guard.findFirst({ where: { id: account.guardId, companyId: session.companyId } })
  if (!ownerGuard) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { accountType, bankName, accountNumber, branch, currency, active } = body

  const updated = await prisma.employeeAccount.update({
    where: { id: params.id },
    data: {
      ...(accountType && { accountType }),
      ...(bankName && { bankName }),
      ...(accountNumber && { accountNumber }),
      ...(branch !== undefined && { branch }),
      ...(currency && { currency }),
      ...(active !== undefined && { active }),
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'EmployeeAccounts', recordId: params.id, oldValues: account, newValues: updated })
  return NextResponse.json({ account: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.employeeAccount.findFirst({ where: { id: params.id } })
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ownerGuard = await prisma.guard.findFirst({ where: { id: account.guardId, companyId: session.companyId } })
  if (!ownerGuard) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.employeeAccount.delete({ where: { id: params.id } })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'EmployeeAccounts', recordId: params.id })
  return NextResponse.json({ success: true })
}
