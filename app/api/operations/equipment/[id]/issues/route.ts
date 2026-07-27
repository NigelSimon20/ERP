import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const equipment = await prisma.equipment.findFirst({ where: { id: params.id, companyId } })
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const issues = await prisma.equipmentIssue.findMany({
    where: { equipmentId: params.id, companyId },
    orderBy: { issuedAt: 'desc' },
  })

  const guardIds = Array.from(new Set(issues.map((i) => i.guardId)))
  const guards = guardIds.length
    ? await prisma.guard.findMany({ where: { id: { in: guardIds } }, select: { id: true, full_name: true, employee_code: true } })
    : []
  const guardMap = Object.fromEntries(guards.map((g) => [g.id, g]))

  return NextResponse.json({
    issues: issues.map((i) => ({ ...i, guard: guardMap[i.guardId] ?? null })),
  })
}
