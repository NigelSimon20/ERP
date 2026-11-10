import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-error'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

export async function PATCH(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { order } = await req.json() as { order: Array<{ id: string; displayOrder: number }> }
    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: 'order array is required' }, { status: 400 })
    }

    const ids = order.map((o) => o.id)
    const owned = await prisma.portal.count({ where: { id: { in: ids }, companyId: session.companyId } })
    if (owned !== ids.length) return NextResponse.json({ error: 'One or more portals not found' }, { status: 404 })

    await prisma.$transaction(
      order.map((o) => prisma.portal.update({ where: { id: o.id }, data: { displayOrder: o.displayOrder } })),
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return apiError(err, 'Failed to reorder portals', 400)
  }
}
