import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId: counterpartId } = await params
  const meId = session.userId

  const counterpart = await prisma.user.findFirst({
    where: { id: counterpartId, companyId: session.companyId },
    select: { id: true, name: true, role: true },
  })
  if (!counterpart) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const messages = await prisma.message.findMany({
    where: {
      companyId: session.companyId,
      OR: [
        { senderId: meId, recipientId: counterpartId },
        { senderId: counterpartId, recipientId: meId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })

  await prisma.message.updateMany({
    where: { companyId: session.companyId, senderId: counterpartId, recipientId: meId, read: false },
    data: { read: true },
  })

  return NextResponse.json({ counterpart, messages })
}
