import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import crypto from 'crypto'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER']
const ELEVATED_ROLES = ['SUPER_ADMIN', 'ADMIN']

function generateSecurePassword(): string {
  // 12 chars: uppercase + lowercase + digit + symbol
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const rand = (charset: string) => charset[crypto.randomInt(charset.length)]
  const rest = Array.from({ length: 8 }, () => rand(all)).join('')
  return rand(upper) + rand(lower) + rand(digits) + rand(symbols) + rest
}

function generateUsername(name: string, companyId: string): string {
  const parts = name.toLowerCase().trim().split(/\s+/)
  const base = parts.length > 1
    ? parts[0][0] + parts[parts.length - 1]   // jsmith
    : parts[0]
  const suffix = companyId.slice(-4)
  return `${base.replace(/[^a-z0-9]/g, '').slice(0, 12)}${suffix}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { companyId, userId } = session
  const guardId = params.id

  // Find the employee
  const guard = await prisma.guard.findFirst({
    where: { id: guardId, companyId },
  })
  if (!guard) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Check if already linked to a user account
  const existingByGuard = await prisma.user.findFirst({ where: { guardId } })
  if (existingByGuard) {
    return NextResponse.json(
      { error: 'This employee already has a linked user account', userId: existingByGuard.id },
      { status: 409 }
    )
  }

  // Parse optional overrides from body
  const body = await req.json().catch(() => ({}))
  const role: string = body.role ?? 'GUARD'
  if (ELEVATED_ROLES.includes(role) && !ELEVATED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Only Admin or Super Admin can grant that role' }, { status: 403 })
  }
  const emailRaw: string | undefined = body.email ?? guard.email ?? undefined

  if (!emailRaw) {
    return NextResponse.json({ error: 'Employee has no email. Please add an email first.' }, { status: 400 })
  }
  const email = emailRaw.toLowerCase().trim()

  // Check email uniqueness
  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  if (existingByEmail) {
    return NextResponse.json({ error: `Email ${email} is already registered` }, { status: 409 })
  }

  const fullName = guard.full_name ?? (`${guard.first_name ?? ''} ${guard.last_name ?? ''}`.trim() || email)
  const username = generateUsername(fullName, companyId)
  const tempPassword = generateSecurePassword()
  const hashedPassword = await hashPassword(tempPassword)

  const newUser = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      guardId,
      name: fullName,
      email,
      password: hashedPassword,
      role,
      department: guard.department ?? null,
      phone: guard.phone ?? null,
      whatsapp: guard.phone ?? null,
      mustChangePassword: true,
      active: true,
    },
  })

  await logAudit({
    companyId,
    userId,
    userName: session.name,
    action: 'CREATE',
    module: 'UserAccount',
    recordId: newUser.id,
    newValues: { name: fullName, email, role, guardId },
  })

  return NextResponse.json(
    {
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        username,
        tempPassword,
        role: newUser.role,
      },
      message: 'Login account created successfully',
    },
    { status: 201 }
  )
}
