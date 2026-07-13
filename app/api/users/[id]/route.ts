import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const target = await prisma.user.findFirst({ where: { id, companyId: session.companyId } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    const body = await req.json()
    const { role, department, phone, whatsapp, active } = body

    if (active === false && id === session.userId) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
    }

    if (active === false && target.role === 'SUPER_ADMIN') {
      const superAdminCount = await prisma.user.count({
        where: { companyId: session.companyId, role: 'SUPER_ADMIN', active: true },
      })
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: 'Cannot deactivate the last Super Admin' }, { status: 400 })
      }
    }

    const old = { role: target.role, department: target.department, active: target.active }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(role !== undefined && { role }),
        ...(department !== undefined && { department }),
        ...(phone !== undefined && { phone }),
        ...(whatsapp !== undefined && { whatsapp }),
        ...(active !== undefined && { active }),
      },
      select: { id: true, name: true, email: true, role: true, department: true, phone: true, whatsapp: true, active: true },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'Users',
      recordId: id,
      oldValues: old,
      newValues: { role: updated.role, department: updated.department, active: updated.active },
    })

    return NextResponse.json({ user: updated })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
