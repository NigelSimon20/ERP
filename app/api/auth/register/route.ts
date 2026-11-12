import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { prisma } from '@/lib/prisma'
import { seedChartOfAccounts } from '@/lib/onboarding/seedChartOfAccounts'
import { hashPassword } from '@/lib/auth'
import { SessionData, sessionOptions } from '@/lib/session'
import { registerSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { getIpAddress } from '@/lib/utils'
import { apiError } from '@/lib/api-error'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const normalizedBody = {
      ...body,
      name: typeof body?.name === 'string' ? body.name.trim() : body?.name,
      email: typeof body?.email === 'string' ? body.email.trim().toLowerCase() : body?.email,
      phone: typeof body?.phone === 'string' ? body.phone.trim() : body?.phone,
      whatsapp: typeof body?.whatsapp === 'string' && body.whatsapp.trim() ? body.whatsapp.trim() : undefined,
      companyName: typeof body?.companyName === 'string' ? body.companyName.trim() : body?.companyName,
    }
    const { companyName, name, email, phone, whatsapp, password } = registerSchema.parse(normalizedBody)
    const normalizedEmail = email.toLowerCase()

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const hash = await hashPassword(password)

    await prisma.$transaction([
      prisma.company.create({
        data: {
          id: companyId,
          name: companyName,
          email: normalizedEmail,
          currency: 'USD',
          updatedAt: new Date(),
        },
      }),
      prisma.user.create({
        data: {
          id: userId,
          companyId,
          name,
          email: normalizedEmail,
          password: hash,
          role: 'SUPER_ADMIN',
          phone: phone ?? null,
          whatsapp: whatsapp ?? null,
          updatedAt: new Date(),
        },
      }),
    ])

    // A6: a new company starts with a default chart of accounts and linked
    // GL settings. Its own transaction; a failure here doesn't undo the
    // sign-up (the Chart of Accounts page can load it later).
    await seedChartOfAccounts(prisma, companyId, userId).catch((e) => console.error('[register] default chart failed', e))

    const res = NextResponse.json(
      { user: { id: userId, name, email: normalizedEmail, role: 'SUPER_ADMIN' }, company: { id: companyId, name: companyName } },
      { status: 201 }
    )

    const session = await getIronSession<SessionData>(req, res, sessionOptions)
    session.userId = userId
    session.companyId = companyId
    session.role = 'SUPER_ADMIN'
    session.name = name
    session.email = normalizedEmail
    session.isLoggedIn = true
    session.issuedAt = Date.now()
    session.checkedAt = Date.now()
    await session.save()

    await logAudit({
      companyId,
      userId,
      userName: name,
      action: 'LOGIN',
      module: 'AUTH',
      ipAddress: getIpAddress(req),
    })

    return res
  } catch (err: unknown) {
    return apiError(err, 'Registration failed', 400)
  }
}
