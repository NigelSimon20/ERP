import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const existing = await prisma.patrol.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { actualTime, status, notes, guardId } = body

  const patrol = await prisma.patrol.update({
    where: { id: params.id },
    data: {
      ...(actualTime ? { actualTime: new Date(actualTime) } : {}),
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(guardId !== undefined ? { guardId: guardId || null } : {}),
    },
    // no relation includes (schema uses raw FK fields)
  })
  await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'Patrol', recordId: patrol.id, oldValues: existing, newValues: patrol })
  return NextResponse.json({ patrol })
}
