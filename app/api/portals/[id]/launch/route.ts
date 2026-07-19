import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const portal = await prisma.portal.findFirst({
    where: { id, companyId: session.companyId },
    include: { roleAccess: true },
  })
  if (!portal) return NextResponse.json({ error: 'Portal not found' }, { status: 404 })
  if (!portal.roleAccess.some((r) => r.role === session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.portalUsageLog.create({
    data: { id: crypto.randomUUID(), portalId: id, userId: session.userId, action: 'LAUNCH' },
  })

  return NextResponse.json({ success: true }, { status: 201 })
}
