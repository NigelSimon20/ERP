import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIronSession } from 'iron-session'
import { prisma } from '@/lib/prisma'
import { SessionData, sessionOptions } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { getIpAddress } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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
 * GET /api/auth/oauth/callback
 * Handles OAuth callback from Supabase
 * Exchanges authorization code for session
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams, origin } = req.nextUrl
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (error) {
      console.error('OAuth error:', error, errorDescription)
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(errorDescription || 'Authentication failed')}`, origin)
      )
    }

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=No auth code', origin))
    }

    // Exchange code for session using Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError || !data.user) {
      console.error('Token exchange error:', exchangeError)
      return NextResponse.redirect(new URL('/login?error=Authentication failed', origin))
    }

    const { user } = data
    const email = user.email?.toLowerCase()
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
    const picture = user.user_metadata?.avatar_url

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=No email from provider', origin))
    }

    // Check if user exists
    let dbUser = await prisma.user.findUnique({
      where: { email },
      include: { company: { select: { id: true, name: true } } },
    })

    // Invitation-only: an admin must create the user (Settings -> Users) before
    // they can sign in via OAuth. We never auto-attach a new account to an
    // arbitrary/first company here.
    if (!dbUser) {
      return NextResponse.redirect(
        new URL('/login?error=No account found for this email. Contact your administrator.', origin)
      )
    }

    if (!dbUser.active) {
      return NextResponse.redirect(new URL('/login?error=Account is inactive', origin))
    }

    // Update user info and last login
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        lastLogin: new Date(),
        avatar: picture,
        name, // Update name in case it changed
      },
    })

    // Resolve guardId for GUARD role users
    let guardId: string | undefined
    if (dbUser.role === 'GUARD') {
      const guard = await prisma.guard.findFirst({
        where: { email: dbUser.email, companyId: dbUser.companyId },
        select: { id: true },
      })
      guardId = guard?.id
      if (guardId && dbUser.guardId !== guardId) {
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { guardId },
        })
      }
    }

    // Determine dashboard path based on role
    const dashboardPath = ROLE_DASHBOARD[dbUser.role] || '/dashboard'

    // Create session
    const res = NextResponse.redirect(dashboardPath)
    const session = await getIronSession<SessionData>(req, res, sessionOptions)

    session.userId = dbUser.id
    session.companyId = dbUser.companyId
    session.role = dbUser.role
    session.name = dbUser.name
    session.email = dbUser.email
    session.isLoggedIn = true
    session.issuedAt = Date.now()
    session.checkedAt = Date.now()
    session.mustChangePassword = dbUser.mustChangePassword
    session.guardId = guardId

    await session.save()

    // Log audit
    await logAudit({
      companyId: dbUser.companyId,
      userId: dbUser.id,
      userName: dbUser.name,
      action: 'LOGIN',
      module: 'AUTH',
      ipAddress: getIpAddress(req),
    })

    // Redirect to dashboard
    return res
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(new URL('/login?error=Authentication failed', req.nextUrl.origin))
  }
}
