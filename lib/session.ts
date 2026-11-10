import { getIronSession, IronSession, SessionOptions } from 'iron-session'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export interface SessionData {
  userId: string
  companyId: string
  role: string
  name: string
  email: string
  isLoggedIn: boolean
  mustChangePassword?: boolean
  guardId?: string
  customerId?: string
  // Epoch ms. issuedAt is compared with User.passwordChangedAt; checkedAt
  // throttles that DB check in middleware (see SESSION_RECHECK_MS).
  issuedAt?: number
  checkedAt?: number
}

export const SESSION_RECHECK_MS = 5 * 60 * 1000

// A session is revoked once the user is deactivated or their password was
// changed after the session was issued. Sessions from before issuedAt
// existed count as issued at 0.
export function isSessionRevoked(
  session: Pick<SessionData, 'issuedAt'>,
  user: { active: boolean; passwordChangedAt: Date | null } | null,
): boolean {
  if (!user || !user.active) return true
  if (!user.passwordChangedAt) return false
  return user.passwordChangedAt.getTime() > (session.issuedAt ?? 0)
}

export const sessionOptions: SessionOptions = {
  cookieName: 'ravenshield_session',
  password: process.env.SESSION_PASSWORD!,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 28800, // 8 hours
  },
}

export async function getSession(
  req?: NextRequest,
  res?: NextResponse
): Promise<IronSession<SessionData>> {
  if (req && res) {
    return getIronSession<SessionData>(req, res, sessionOptions)
  }
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

type ApiHandler = (
  req: NextRequest,
  context: { params: Record<string, string> }
) => Promise<NextResponse>

export function withSession(handler: ApiHandler): ApiHandler {
  return async (req, context) => {
    const res = NextResponse.next()
    const session = await getSession(req, res)
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return handler(req, context)
  }
}
