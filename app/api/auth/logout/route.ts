import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true })
  const session = await getIronSession<SessionData>(req, res, sessionOptions)

  if (session.isLoggedIn) {
    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'LOGOUT',
      module: 'AUTH',
    })
  }

  session.destroy()
  return res
}
