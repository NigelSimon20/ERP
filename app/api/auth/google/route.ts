import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { SessionData, sessionOptions } from '@/lib/session'
import { generateToken } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { getIpAddress } from '@/lib/utils'

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN: '/dashboard/executive',
  ADMIN: '/dashboard/executive',
  FINANCE_MANAGER: '/dashboard/finance',
  OPERATIONS_MANAGER: '/dashboard/operations',
  HR_MANAGER: '/dashboard/hr',
  BD_MANAGER: '/dashboard/business-development',
  GUARD: '/dashboard/guard',
  STAFF: '/dashboard/staff',
  READ_ONLY: '/dashboard/readonly',
  CLIENT: '/portal/client',
}

/**
 * POST /api/auth/google
 * Handles Google OAuth callback and creates/updates user session
 * Expected body: { idToken: string, googleId: string, email: string, name: string, picture?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, name, picture, googleId } = body

    if (!email || !googleId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const lowerEmail = email.toLowerCase()

    // Check if user exists
    let user: any = await prisma.user.findUnique({
      where: { email: lowerEmail },
      include: { company: { select: { id: true, name: true } } },
    })

    // If user doesn't exist, create one
    if (!user) {
      // Try to find or create a company (default company for OAuth users)
      let company = await prisma.company.findFirst()
      if (!company) {
        company = await prisma.company.create({
          data: {
            name: 'Default Company',
            email: lowerEmail,
            currency: 'USD',
          },
        })
      }

      user = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          email: lowerEmail,
          name: name || email.split('@')[0],
          password: '', // OAuth users don't have passwords
          role: 'STAFF',
          companyId: company.id,
          avatar: picture,
          active: true,
        },
        include: { company: { select: { id: true, name: true } } },
      }) as any
    }

    if (!user.active) {
      return NextResponse.json(
        { error: 'Account is inactive' },
        { status: 403 }
      )
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        avatar: picture, // Update avatar if provided
      },
    })

    // Resolve guardId for GUARD role users
    let guardId: string | undefined
    if (user.role === 'GUARD') {
      const guard = await prisma.guard.findFirst({
        where: { email: user.email, companyId: user.companyId },
        select: { id: true },
      })
      guardId = guard?.id
      if (guardId && user.guardId !== guardId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { guardId },
        })
      }
    }

    const dashboardPath = ROLE_DASHBOARD[user.role] ?? '/dashboard/readonly'
    const res = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          mustChangePassword: user.mustChangePassword,
        },
        dashboardPath,
      },
      { status: 200 }
    )

    const session = await getIronSession<SessionData>(req, res, sessionOptions)
    session.userId = user.id
    session.companyId = user.companyId
    session.role = user.role
    session.name = user.name
    session.email = user.email
    session.isLoggedIn = true
    session.mustChangePassword = user.mustChangePassword
    session.guardId = guardId

    await session.save()

    // Log audit
    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: 'LOGIN',
      module: 'AUTH',
      ipAddress: getIpAddress(req),
    })

    return res
  } catch (err) {
    console.error('Google auth error:', err)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
