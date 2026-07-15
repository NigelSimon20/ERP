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
