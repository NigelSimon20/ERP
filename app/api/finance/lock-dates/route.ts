import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
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

  const locks = await prisma.lockDate.findMany({
    where: { companyId: session.companyId },
    orderBy: { lockedUntil: 'desc' },
  })

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(locks.map((l) => l.lockedBy))) } },
    select: { id: true, name: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const result = locks.map((l) => ({ ...l, createdByUser: userMap[l.lockedBy] ? { name: userMap[l.lockedBy].name } : null }))
  return NextResponse.json({ locks: result })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!['SUPER_ADMIN', 'FINANCE_MANAGER'].includes(session.role ?? '')) {
    return NextResponse.json({ error: 'Only Finance Managers and Super Admins can lock dates' }, { status: 403 })
  }

  const body = await req.json()
  const { lockedUntil, reason } = body

  if (!lockedUntil) return NextResponse.json({ error: 'lockedUntil required' }, { status: 400 })

  const lock = await prisma.lockDate.create({
    data: {
      id: crypto.randomUUID(),
      companyId: session.companyId,
      module: 'ALL',
      reason: reason || null,
      lockedUntil: new Date(lockedUntil),
      lockedBy: session.userId,
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'LockDates', recordId: lock.id })
  return NextResponse.json({ lock }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only Super Admins can remove lock dates' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const lock = await prisma.lockDate.findFirst({ where: { id, companyId: session.companyId } })
  if (!lock) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.lockDate.delete({ where: { id } })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'LockDates', recordId: id })
  return NextResponse.json({ success: true })
}
