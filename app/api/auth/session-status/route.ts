import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions, isSessionRevoked } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// Called by middleware (edge runtime, no Prisma) at most every
// SESSION_RECHECK_MS per session to learn whether it has been revoked.
export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ valid: false }, { headers: { 'Cache-Control': 'private, no-store' } })

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { active: true, passwordChangedAt: true },
  })
  return NextResponse.json(
    { valid: !isSessionRevoked(session, user) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
