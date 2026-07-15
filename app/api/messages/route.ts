import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const recipientId = String(body.recipientId ?? '')
  const text = String(body.body ?? '').trim()

  if (!recipientId) return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
  if (recipientId === session.userId) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })

  const recipient = await prisma.user.findFirst({
    where: { id: recipientId, companyId: session.companyId },
    select: { id: true },
  })
  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })

  const message = await prisma.message.create({
    data: {
      id: crypto.randomUUID(),
      companyId: session.companyId,
      senderId: session.userId,
      recipientId,
      body: text,
    },
  })

  return NextResponse.json({ message }, { status: 201 })
}
