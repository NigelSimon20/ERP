import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { ensureDefaultPortals, CATEGORY_OPTIONS } from '@/lib/portals'
import crypto from 'crypto'
import { apiError } from '@/lib/api-error'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  await ensureDefaultPortals(companyId)

  const isAdminScope = new URL(req.url).searchParams.get('scope') === 'admin' && ADMIN_ROLES.includes(session.role)

  const portals = await prisma.portal.findMany({
    where: {
      companyId,
      ...(isAdminScope ? {} : { isActive: true }),
    },
    include: { roleAccess: true },
    orderBy: { displayOrder: 'asc' },
  })

  const visible = isAdminScope
    ? portals
    : portals.filter((p) => p.roleAccess.some((r) => r.role === session.role))

  const [roleCounts, lastAccess] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      where: { companyId, active: true },
      _count: { id: true },
    }),
    prisma.portalUsageLog.groupBy({
      by: ['portalId'],
      where: { userId: session.userId, portalId: { in: visible.map((p) => p.id) }, action: 'LAUNCH' },
      _max: { createdAt: true },
    }),
  ])

  const roleCountMap = Object.fromEntries(roleCounts.map((r) => [r.role, r._count.id]))
  const lastAccessMap = Object.fromEntries(lastAccess.map((l) => [l.portalId, l._max.createdAt]))

  const result = visible.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    description: p.description,
    url: p.url,
    logoUrl: p.logoUrl,
    icon: p.icon,
    colorPrimary: p.colorPrimary,
    colorSecondary: p.colorSecondary,
    buttonText: p.buttonText,
    openBehavior: p.openBehavior,
    isActive: p.isActive,
    isSystem: p.isSystem,
    displayOrder: p.displayOrder,
    supportContact: p.supportContact,
    roles: p.roleAccess.map((r) => r.role),
    eligibleUserCount: p.roleAccess.reduce((sum, r) => sum + (roleCountMap[r.role] ?? 0), 0),
    lastAccessedByMe: lastAccessMap[p.id] ?? null,
  }))

  return NextResponse.json({ portals: result, categories: CATEGORY_OPTIONS })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { name, category, description, url, roles } = body
    if (!name || !category || !description || !url || !Array.isArray(roles) || roles.length === 0) {
      return NextResponse.json({ error: 'Name, category, description, URL, and at least one role are required' }, { status: 400 })
    }
    if (!CATEGORY_OPTIONS.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const slug = String(body.slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      || crypto.randomUUID().slice(0, 8)

    const existing = await prisma.portal.findUnique({ where: { companyId_slug: { companyId: session.companyId, slug } } })
    if (existing) return NextResponse.json({ error: 'A portal with this name already exists' }, { status: 409 })

    const maxOrder = await prisma.portal.aggregate({ where: { companyId: session.companyId }, _max: { displayOrder: true } })

    const portal = await prisma.portal.create({
      data: {
        id: crypto.randomUUID(),
        companyId: session.companyId,
        slug,
        name,
        category,
        description,
        url,
        logoUrl: body.logoUrl || null,
        icon: body.icon || null,
        colorPrimary: body.colorPrimary || null,
        colorSecondary: body.colorSecondary || null,
        buttonText: body.buttonText || 'Open Portal',
        openBehavior: body.openBehavior || 'NEW_TAB',
        isActive: body.isActive ?? true,
        supportContact: body.supportContact || null,
        displayOrder: (maxOrder._max.displayOrder ?? -1) + 1,
        roleAccess: {
          create: roles.map((role: string) => ({ id: crypto.randomUUID(), role })),
        },
      },
      include: { roleAccess: true },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'Portals',
      recordId: portal.id,
      newValues: { name, category, url },
    })

    return NextResponse.json({ portal }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed to create portal', 400)
  }
}
