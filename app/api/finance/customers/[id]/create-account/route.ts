import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import crypto from 'crypto'

// Mirrors app/api/hr/employees/[id]/create-account/route.ts (the same
// pattern already established for linking a Guard to a login account) —
// this is the Customer/CLIENT equivalent. Role enforcement for this route
// comes from middleware.ts's /api/finance ROLE_GUARDS entry, same as every
// other route under /api/finance/customers.

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const rand = (charset: string) => charset[crypto.randomInt(charset.length)]
  const rest = Array.from({ length: 8 }, () => rand(all)).join('')
  return rand(upper) + rand(lower) + rand(digits) + rand(symbols) + rest
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const customerId = params.id

  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const existingByCustomer = await prisma.user.findFirst({ where: { customerId } })
  if (existingByCustomer) {
    return NextResponse.json(
      { error: 'This customer already has a linked portal account', userId: existingByCustomer.id },
      { status: 409 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const emailRaw: string | undefined = body.email ?? customer.email ?? undefined
  if (!emailRaw) {
    return NextResponse.json({ error: 'Customer has no email on file. Please add one first.' }, { status: 400 })
  }
  const email = emailRaw.toLowerCase().trim()

  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  if (existingByEmail) {
    return NextResponse.json({ error: `Email ${email} is already registered` }, { status: 409 })
  }

  const fullName = customer.company_name ?? email
  const tempPassword = generateSecurePassword()
  const hashedPassword = await hashPassword(tempPassword)

  const newUser = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      customerId,
      name: fullName,
      email,
      password: hashedPassword,
      role: 'CLIENT',
      phone: customer.phone ?? null,
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
    newValues: { name: fullName, email, role: 'CLIENT', customerId },
  })

  return NextResponse.json(
    {
      success: true,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
      tempPassword,
      message: 'Client portal account created successfully',
    },
    { status: 201 }
  )
}
