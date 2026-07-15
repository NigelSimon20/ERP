import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// Threads = one row per distinct conversation partner, with the latest
// message and unread count. No Conversation table — derived from Message
// rows, which is simple enough at DM scale and avoids an extra model.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meId = session.userId

  const recent = await prisma.message.findMany({
    where: { companyId: session.companyId, OR: [{ senderId: meId }, { recipientId: meId }] },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const unreadGroups = await prisma.message.groupBy({
    by: ['senderId'],
    where: { companyId: session.companyId, recipientId: meId, read: false },
    _count: { _all: true },
  })
  const unreadBySender = new Map(unreadGroups.map((g) => [g.senderId, g._count._all]))

  const latestByCounterpart = new Map<string, (typeof recent)[number]>()
  for (const msg of recent) {
    const counterpartId = msg.senderId === meId ? msg.recipientId : msg.senderId
    if (!latestByCounterpart.has(counterpartId)) latestByCounterpart.set(counterpartId, msg)
  }

  const counterpartIds = Array.from(latestByCounterpart.keys())
  const users = await prisma.user.findMany({
    where: { id: { in: counterpartIds } },
    select: { id: true, name: true, role: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  const threads = counterpartIds
    .map((id) => {
      const lastMessage = latestByCounterpart.get(id)!
      const user = userById.get(id)
      if (!user) return null
      return {
        userId: id,
        name: user.name,
        role: user.role,
        lastMessage: lastMessage.body,
        lastMessageAt: lastMessage.createdAt,
        lastMessageFromMe: lastMessage.senderId === meId,
        unreadCount: unreadBySender.get(id) ?? 0,
      }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0)

  return NextResponse.json({ threads, totalUnread })
}
