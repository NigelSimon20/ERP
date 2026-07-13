import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await prisma.user.findMany({
    where: { companyId: session.companyId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      phone: true,
      whatsapp: true,
      active: true,
      mustChangePassword: true,
      lastLogin: true,
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { name, email, role, department, phone, whatsapp } = await req.json()
    if (!name || !email || !role) {
      return NextResponse.json({ error: 'Name, email, and role are required' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 })

    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const tempPassword =
      Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') + '!7'
    const hashed = await hashPassword(tempPassword)

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        name,
        email: email.toLowerCase(),
        password: hashed,
        role,
        department: department || null,
        phone: phone || null,
        whatsapp: whatsapp || null,
        mustChangePassword: true,
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'Users',
      recordId: user.id,
      newValues: { name, email, role },
    })

    return NextResponse.json(
      {
        user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active },
        tempPassword,
      },
      { status: 201 },
    )
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
