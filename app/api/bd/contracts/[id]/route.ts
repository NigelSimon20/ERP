import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

function mapContract(c: { contractValue: unknown; [k: string]: unknown }) {
  const { contractValue, ...rest } = c
  return { ...rest, contractValue: Number(contractValue) }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const contract = await prisma.contract.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ contract: mapContract(contract) })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.contract.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { title, customerId, siteId, contractValue, billingFrequency, startDate, endDate, notes, status } = body

  if (status && !['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(customerId !== undefined ? { customerId: customerId || null } : {}),
      ...(siteId !== undefined ? { siteId: siteId || null } : {}),
      ...(contractValue !== undefined ? { contractValue: Number(contractValue) } : {}),
      ...(billingFrequency !== undefined ? { billingFrequency: billingFrequency || null } : {}),
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'BD', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: updated.status } })
  return NextResponse.json({ contract: mapContract(updated) })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.contract.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT contracts can be deleted' }, { status: 409 })

  await prisma.contract.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'DELETE', module: 'BD', recordId: params.id, oldValues: { contractNumber: existing.contractNumber } })
  return NextResponse.json({ success: true })
}
