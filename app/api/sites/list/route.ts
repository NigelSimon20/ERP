import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// Lightweight, role-agnostic site list for the global top-bar site filter.
// Unlike /api/operations/sites, this is reachable by every authenticated
// role (not just SUPER_ADMIN/ADMIN/OPERATIONS_MANAGER), since the site
// filter is used in the shell that wraps every dashboard page.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sites = await prisma.site.findMany({
    where: { companyId: session.companyId, site_name: { not: null }, is_active: { not: false } },
    select: { id: true, site_name: true },
    orderBy: { site_name: 'asc' },
  })

  return NextResponse.json({
    sites: sites.map((s) => ({ id: s.id, name: s.site_name as string })),
  })
}
