import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { toGuardDto } from '@/lib/guards'

// Unpaginated list of active guards for picker dropdowns (Deployments,
// Incidents, Patrols, ...). /api/hr/employees pages at 25 rows, which is
// wrong for a select; these dialogs were fetching this path while it didn't
// exist, so their Guard dropdowns 404'd empty.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guards = await prisma.guard.findMany({
    where: { companyId: session.companyId, status: 'Active' },
    orderBy: { full_name: 'asc' },
  })

  return NextResponse.json({ guards: guards.map(toGuardDto) })
}
