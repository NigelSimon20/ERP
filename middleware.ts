import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions, SESSION_RECHECK_MS } from '@/lib/session'

// Each entry lists every real path prefix (page AND api) that the rule must
// cover. Page and API prefixes for a module are NOT always the same string
// (e.g. Human Resources pages live at /human-resources but its API lives at
// /api/hr; Business Development pages live at /business-development but its
// API lives at /api/bd) — deriving one from the other silently missed the
// API routes for both modules, leaving /api/hr/* and /api/bd/* reachable by
// any logged-in user regardless of role. List each real prefix explicitly.
const ROLE_GUARDS: [string, string[]][] = [
  ['/finance', ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER']],
  ['/api/finance', ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER']],
  ['/human-resources', ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER']],
  ['/api/hr', ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER']],
  ['/operations', ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']],
  ['/api/operations', ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER']],
  ['/business-development', ['SUPER_ADMIN', 'ADMIN', 'BD_MANAGER']],
  ['/api/bd', ['SUPER_ADMIN', 'ADMIN', 'BD_MANAGER']],
  ['/settings', ['SUPER_ADMIN', 'ADMIN']],
  ['/api/settings', ['SUPER_ADMIN', 'ADMIN']],
  ['/api/users', ['SUPER_ADMIN', 'ADMIN']],
]

const DASHBOARD_ACCESS: Record<string, string[]> = {
  '/dashboard/executive':            ['SUPER_ADMIN', 'ADMIN'],
  '/dashboard/finance':              ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'],
  '/dashboard/operations':           ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'],
  '/dashboard/hr':                   ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'],
  '/dashboard/business-development': ['SUPER_ADMIN', 'ADMIN', 'BD_MANAGER'],
  '/dashboard/guard':                ['SUPER_ADMIN', 'ADMIN', 'GUARD'],
  '/dashboard/staff':                ['SUPER_ADMIN', 'ADMIN', 'STAFF'],
  '/dashboard/readonly':             ['SUPER_ADMIN', 'ADMIN', 'READ_ONLY'],
}

const ROLE_DASHBOARD_MAP: Record<string, string> = {
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

function isApiRoute(pathname: string) {
  return pathname.startsWith('/api/')
}

// Edge runtime has no Prisma, so ask a Node route. null = couldn't tell
// (network blip); the caller lets the request through and retries later.
async function isSessionStillValid(req: NextRequest): Promise<boolean | null> {
  try {
    const r = await fetch(new URL('/api/auth/session-status', req.url), {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    })
    if (!r.ok) return null
    const { valid } = await r.json()
    return typeof valid === 'boolean' ? valid : null
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Dotted paths are static assets -- but never skip auth for /api, where a
  // dotted [id] (e.g. /api/hr/employees/a.b) used to bypass the role guards.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    (pathname.includes('.') && !isApiRoute(pathname))
  ) {
    return NextResponse.next()
  }

  const isAuthPage = pathname === '/login' || pathname === '/register'
  // /api/cron/* has no session — Vercel's scheduler calls it directly with a
  // Bearer token, authenticated by each route handler itself (isValidCronRequest).
  const isPublicApi = pathname.startsWith('/api/auth/') || pathname.startsWith('/api/cron/')

  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)

  if (isPublicApi) return res

  if (isAuthPage) {
    if (session.isLoggedIn) {
      const target = ROLE_DASHBOARD_MAP[session.role] ?? '/dashboard'
      return NextResponse.redirect(new URL(target, req.url))
    }
    return res
  }

  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/finance') ||
    pathname.startsWith('/operations') ||
    pathname.startsWith('/human-resources') ||
    pathname.startsWith('/business-development') ||
    pathname.startsWith('/tasks-requests') ||
    pathname.startsWith('/file-manager') ||
    pathname.startsWith('/ai-helpdesk') ||
    pathname.startsWith('/external-portals') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/portal') ||
    isApiRoute(pathname)

  if (!isProtected) return res

  if (!session.isLoggedIn) {
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Revocation (password reset, deactivated user), checked at most every
  // SESSION_RECHECK_MS per session.
  if (!session.checkedAt || Date.now() - session.checkedAt > SESSION_RECHECK_MS) {
    const valid = await isSessionStillValid(req)
    if (valid === false) {
      const out = isApiRoute(pathname)
        ? NextResponse.json({ error: 'Session expired', code: 'SESSION_REVOKED' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', req.url))
      out.cookies.delete(sessionOptions.cookieName)
      return out
    }
    if (valid === true) {
      session.checkedAt = Date.now()
      await session.save()
    }
  }

  // Force password change
  if (
    session.mustChangePassword &&
    !pathname.startsWith('/change-password') &&
    !pathname.startsWith('/api/auth/change-password') &&
    !pathname.startsWith('/api/auth/logout')
  ) {
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: 'Password change required' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  // Dashboard-specific access control
  for (const [dashPath, allowed] of Object.entries(DASHBOARD_ACCESS)) {
    if (pathname === dashPath || pathname.startsWith(dashPath + '/')) {
      if (!allowed.includes(session.role)) {
        const ownDash = ROLE_DASHBOARD_MAP[session.role] ?? '/dashboard'
        const redirectUrl = new URL(ownDash, req.url)
        redirectUrl.searchParams.set('blocked', 'true')
        return NextResponse.redirect(redirectUrl)
      }
      break
    }
  }

  // GET /api/settings (exact path only, not its admin-only sub-routes like
  // .../logo or .../backup/*) returns company profile/branding/tax fields
  // that every department's own PDF generation (quotations, payslips,
  // reports...) legitimately needs to read regardless of role -- the PUT
  // handler already independently re-enforces SUPER_ADMIN/ADMIN itself, so
  // this doesn't weaken write protection, only read access to non-secret,
  // largely customer-facing data (e.g. the bank details already printed on
  // every invoice/quotation PDF footer).
  if (pathname === '/api/settings' && req.method === 'GET') {
    return res
  }

  // Module-level role-based access control
  for (const [prefix, allowed] of ROLE_GUARDS) {
    if (pathname.startsWith(prefix)) {
      if (!allowed.includes(session.role)) {
        if (isApiRoute(pathname)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
