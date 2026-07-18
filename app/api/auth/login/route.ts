import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { verifyPassword, hashPassword } from '@/lib/auth'
import { SessionData, sessionOptions } from '@/lib/session'
import { loginSchema } from '@/lib/validators'
import { logAudit } from '@/lib/audit'
import { getIpAddress } from '@/lib/utils'

const FAIL_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN:          '/dashboard/executive',
  ADMIN:                '/dashboard/executive',
  FINANCE_MANAGER:      '/dashboard/finance',
  OPERATIONS_MANAGER:   '/dashboard/operations',
  HR_MANAGER:           '/dashboard/hr',
  BD_MANAGER:           '/dashboard/business-development',
  GUARD:                '/dashboard/guard',
  STAFF:                '/dashboard/staff',
  READ_ONLY:            '/dashboard/readonly',
  CLIENT:               '/portal/client',
}

async function verifyWithSupabase(email: string, password: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return null
  }

  return data.user
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = loginSchema.parse(body)
    const lowerEmail = email.toLowerCase()

    const windowStart = new Date(Date.now() - FAIL_WINDOW_MS)
    const failCount = await prisma.otpToken.count({
      where: { email: lowerEmail, token: 'LOGIN_FAIL', createdAt: { gte: windowStart } },
    })

    if (failCount >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }

    let user = await prisma.user.findUnique({
      where: { email: lowerEmail },
      include: { company: { select: { id: true, name: true } } },
    })

    let supabaseUser = null
    let valid = false

    if (user) {
      valid = await verifyPassword(password, user.password)
    }

    if (!valid) {
      supabaseUser = await verifyWithSupabase(lowerEmail, password)
      if (supabaseUser) {
        valid = true
      }
    }

    if (!valid) {
      await recordFail(lowerEmail)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user && supabaseUser) {
      const company =
        (await prisma.company.findFirst()) ||
        (await prisma.company.create({
          data: {
            name: 'Default Company',
            email: lowerEmail,
            currency: 'USD',
          },
        }))

      const hashedPassword = await hashPassword(password)
      user = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          companyId: company.id,
          email: lowerEmail,
          name: supabaseUser.user_metadata?.full_name || lowerEmail,
          password: hashedPassword,
          role: 'STAFF',
          avatar: supabaseUser.user_metadata?.avatar_url || undefined,
          active: true,
          lastLogin: new Date(),
        },
        include: { company: { select: { id: true, name: true } } },
      })
    }

    if (user && !valid && supabaseUser) {
      const hashedPassword = await hashPassword(password)
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, lastLogin: new Date() },
      })
    }

    if (user) {
      await prisma.otpToken.deleteMany({ where: { email: lowerEmail, token: 'LOGIN_FAIL' } })
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Capture previous lastLogin before updating it
    const previousLastLogin = user.lastLogin?.toISOString() ?? null

    // Update lastLogin to now
    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

    let guardId: string | undefined
    if (user.role === 'GUARD') {
      const guard = await prisma.guard.findFirst({
        where: { email: user.email, companyId: user.companyId },
        select: { id: true },
      })
      guardId = guard?.id
      if (guardId && user.guardId !== guardId) {
        await prisma.user.update({ where: { id: user.id }, data: { guardId } })
      }
    }

    let customerId: string | undefined = user.customerId ?? undefined
    if (user.role === 'CLIENT' && !customerId) {
      const customer = await prisma.customer.findFirst({
        where: { email: user.email, companyId: user.companyId },
        select: { id: true },
      })
      customerId = customer?.id
      if (customerId) {
        await prisma.user.update({ where: { id: user.id }, data: { customerId } })
      }
    }

    // Fetch unread notification count and pending task count in parallel
    const [unreadCount, pendingTasks] = await Promise.all([
      prisma.notification.count({
        where: { userId: user.id, companyId: user.companyId, read: false },
      }),
      prisma.task.count({
        where: {
          companyId: user.companyId,
          assignedTo: user.id,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      }),
    ])

    const dashboardPath = ROLE_DASHBOARD[user.role] ?? '/dashboard/readonly'

    const res = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company.name,
        department: user.department ?? null,
        mustChangePassword: user.mustChangePassword,
        lastLogin: previousLastLogin,
        guardId: guardId ?? null,
        customerId: customerId ?? null,
      },
      dashboardPath,
      unreadCount,
      pendingTasks,
    })

    const session = await getIronSession<SessionData>(req, res, sessionOptions)
    session.userId = user.id
    session.companyId = user.companyId
    session.role = user.role
    session.name = user.name
    session.email = user.email
    session.isLoggedIn = true
    session.mustChangePassword = user.mustChangePassword
    session.guardId = guardId
    session.customerId = customerId
    await session.save()

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: 'LOGIN',
      module: 'AUTH',
      ipAddress: getIpAddress(req),
    })

    return res
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Login failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

async function recordFail(email: string) {
  try {
    await prisma.otpToken.create({
      data: {
        id: crypto.randomUUID(),
        email,
        token: 'LOGIN_FAIL',
        expiresAt: new Date(Date.now() + FAIL_WINDOW_MS),
      },
    })
  } catch {
    // non-critical
  }
}
