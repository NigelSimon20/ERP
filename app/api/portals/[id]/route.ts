import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { CATEGORY_OPTIONS } from '@/lib/portals'
import crypto from 'crypto'
import { apiError } from '@/lib/api-error'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.portal.findFirst({ where: { id, companyId: session.companyId } })
  if (!existing) return NextResponse.json({ error: 'Portal not found' }, { status: 404 })

  try {
    const body = await req.json()
    if (body.category && !CATEGORY_OPTIONS.includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    for (const field of [
      'name', 'category', 'description', 'url', 'logoUrl', 'icon',
      'colorPrimary', 'colorSecondary', 'buttonText', 'openBehavior',
      'isActive', 'supportContact',
    ]) {
      if (field in body) data[field] = body[field]
    }

    const portal = await prisma.$transaction(async (tx) => {
      if (Array.isArray(body.roles)) {
        await tx.portalRoleAccess.deleteMany({ where: { portalId: id } })
        await tx.portalRoleAccess.createMany({
          data: body.roles.map((role: string) => ({ id: crypto.randomUUID(), portalId: id, role })),
        })
      }
      return tx.portal.update({ where: { id }, data, include: { roleAccess: true } })
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'Portals',
      recordId: id,
      oldValues: { name: existing.name, url: existing.url, isActive: existing.isActive },
      newValues: data,
    })

    return NextResponse.json({ portal })
  } catch (err: unknown) {
    return apiError(err, 'Failed to update portal', 400)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.portal.findFirst({ where: { id, companyId: session.companyId } })
  if (!existing) return NextResponse.json({ error: 'Portal not found' }, { status: 404 })
  if (existing.isSystem) return NextResponse.json({ error: 'Built-in portals cannot be deleted — disable them instead' }, { status: 403 })

  await prisma.portal.delete({ where: { id } })

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'DELETE',
    module: 'Portals',
    recordId: id,
    oldValues: { name: existing.name, url: existing.url },
  })

  return NextResponse.json({ success: true })
}
