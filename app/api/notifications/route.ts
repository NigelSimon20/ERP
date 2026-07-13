import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId, companyId: session.companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: session.userId, companyId: session.companyId, read: false },
    }),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const id = searchParams.get('id')

  if (action === 'markRead' && id) {
    await prisma.notification.updateMany({
      where: { id, userId: session.userId },
      data: { read: true },
    })
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.userId, companyId: session.companyId, read: false },
      data: { read: true },
    })
  }

  return NextResponse.json({ success: true })
}
