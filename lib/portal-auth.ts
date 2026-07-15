import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'

/** Verifies the request is a logged-in CLIENT; returns null otherwise. Every /api/portal/client/* route uses this — never the internal /api/finance or /api/operations routes, which are for staff only. */
export async function getClientSession(): Promise<IronSession<SessionData> | null> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn || session.role !== 'CLIENT') return null
  return session
}

/** Same idea for GUARD — every /api/portal/guard/* route uses this instead of the internal /api/hr or /api/operations routes. */
export async function getGuardSession(): Promise<IronSession<SessionData> | null> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn || session.role !== 'GUARD') return null
  return session
}
