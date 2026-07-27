import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.visitorLog.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.checkOut) return NextResponse.json({ error: 'Visitor has already checked out' }, { status: 400 })

  const visitor = await prisma.visitorLog.update({ where: { id: params.id }, data: { checkOut: new Date() } })

  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'VisitorLog', recordId: visitor.id, newValues: { checkOut: visitor.checkOut } })
  return NextResponse.json({ visitor })
}
