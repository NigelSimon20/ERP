import crypto from 'crypto'
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

  const guards = await prisma.guard.findMany({
    where: { companyId: session.companyId },
    select: { id: true, full_name: true, employee_code: true },
  })
  const guardMap = Object.fromEntries(guards.map((g) => [g.id, g]))

  const accounts = await prisma.employeeAccount.findMany({
    where: { guardId: { in: guards.map((g) => g.id) } },
    orderBy: [{ guardId: 'asc' }],
  })

  const result = accounts.map((a) => ({
    ...a,
    guard: guardMap[a.guardId]
      ? { name: guardMap[a.guardId].full_name, employeeNumber: guardMap[a.guardId].employee_code }
      : null,
  }))

  return NextResponse.json({ accounts: result })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { guardId, accountType, bankName, accountNumber, branch, currency } = body

  if (!guardId || !accountType || !bankName || !accountNumber) {
    return NextResponse.json({ error: 'guardId, accountType, bankName, accountNumber required' }, { status: 400 })
  }

  const guard = await prisma.guard.findFirst({ where: { id: guardId, companyId: session.companyId } })
  if (!guard) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const account = await prisma.employeeAccount.create({
    data: {
      id: crypto.randomUUID(),
      guardId,
      accountType,
      bankName,
      accountNumber,
      branch: branch || null,
      currency: currency || 'USD',
      active: true,
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'EmployeeAccounts', recordId: account.id })
  return NextResponse.json({ account }, { status: 201 })
}
