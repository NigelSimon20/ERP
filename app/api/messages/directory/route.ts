import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// Coworker directory for the "new message" picker — every authenticated
// role can message every other role in the same company, so this is
// deliberately not gated by ROLE_GUARDS (unlike /api/users).
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = await prisma.user.findMany({
    where: { companyId: session.companyId, active: true, id: { not: session.userId } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ users })
}
