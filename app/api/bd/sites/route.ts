import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// A narrow, name-only site list for the Contracts page's site picker.
// Deliberately NOT /api/operations/sites, which is restricted to
// OPERATIONS_MANAGER/SUPER_ADMIN/ADMIN and returns the full Site record
// (billing rates, staffing counts, risk level, etc.) -- BD needs to link a
// contract to a site by name, nothing operational.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sites = await prisma.site.findMany({
    where: { companyId: session.companyId },
    select: { id: true, site_name: true },
    orderBy: { site_name: 'asc' },
  })

  return NextResponse.json({ sites: sites.map((s) => ({ id: s.id, name: s.site_name ?? '' })) })
}
