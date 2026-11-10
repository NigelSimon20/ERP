import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const APPROVER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'HR_MANAGER']

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const action = new URL(req.url).searchParams.get('action')
  if (action !== 'approve') return NextResponse.json({ error: 'Unsupported action', code: 'VALIDATION_ERROR' }, { status: 400 })

  const table = await prisma.statutoryTable.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!table) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  if (table.status !== 'DRAFT') return NextResponse.json({ error: 'Only draft tables can be approved', code: 'INVALID_STATE' }, { status: 409 })
  if (!APPROVER_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  if (table.createdBy === session.userId) {
    return NextResponse.json({ error: 'A statutory table must be approved by someone other than the person who entered it', code: 'APPROVAL_REQUIRED' }, { status: 403 })
  }

  const approved = await prisma.statutoryTable.update({ where: { id: table.id }, data: { status: 'APPROVED', approvedBy: session.userId, approvedAt: new Date() } })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'POST', module: 'StatutoryTables', recordId: table.id, oldValues: { status: 'DRAFT' }, newValues: { status: 'APPROVED' } })
  return NextResponse.json({ table: approved })
}
