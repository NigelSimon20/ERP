import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'

const VALID_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'OPERATIONS_MANAGER',
  'HR_MANAGER', 'BD_MANAGER', 'STAFF', 'GUARD', 'CLIENT', 'READ_ONLY',
]

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

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }

      if (id === session.userId) {
        return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 })
      }

      if ((role === 'SUPER_ADMIN' || target.role === 'SUPER_ADMIN') && session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Only a Super Admin can grant or remove the Super Admin role' }, { status: 403 })
      }

      if (target.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
        const superAdminCount = await prisma.user.count({
          where: { companyId: session.companyId, role: 'SUPER_ADMIN', active: true },
        })
        if (superAdminCount <= 1) {
          return NextResponse.json({ error: 'Cannot change the role of the last Super Admin' }, { status: 400 })
        }
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
    return apiError(err, 'Failed', 400)
  }
}

export async function DELETE(
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

  if (id === session.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  if (target.role === 'SUPER_ADMIN') {
    const superAdminCount = await prisma.user.count({
      where: { companyId: session.companyId, role: 'SUPER_ADMIN' },
    })
    if (superAdminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last Super Admin' }, { status: 400 })
    }
  }

  try {
    await prisma.user.delete({ where: { id } })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'DELETE',
      module: 'Users',
      recordId: id,
      oldValues: { name: target.name, email: target.email, role: target.role },
    })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return apiError(err, 'Failed to delete user', 400)
  }
}
