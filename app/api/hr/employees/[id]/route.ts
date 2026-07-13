import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })

  if (!guard) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ guard })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.guard.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, idNumber, phone, email, address, department, position, rank, hourlyRate, status, dateOfBirth, dateHired, whatsapp } = body

  const guard = await prisma.guard.update({
    where: { id: params.id },
    data: {
      ...(name ? { name } : {}),
      ...(idNumber !== undefined ? { idNumber: idNumber || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
      ...(department !== undefined ? { department: department || null } : {}),
      ...(position !== undefined ? { position: position || null } : {}),
      ...(rank !== undefined ? { rank: rank || null } : {}),
      ...(hourlyRate != null ? { hourlyRate: Number(hourlyRate) } : {}),
      ...(status ? { status } : {}),
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
      ...(dateHired !== undefined ? { dateHired: dateHired ? new Date(dateHired) : null } : {}),
      ...(whatsapp !== undefined ? { whatsapp: whatsapp || null } : {}),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Guard', recordId: guard.id, oldValues: existing, newValues: guard })
  return NextResponse.json({ guard })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const guard = await prisma.guard.findFirst({ where: { id: params.id, companyId } })
  if (!guard) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [activeDeployments, pendingPayslips] = await Promise.all([
    prisma.deployment.count({ where: { guardId: params.id, status: 'ACTIVE' } }),
    prisma.payslip.count({ where: { employee_id: params.id, status: { in: ['PENDING', 'PROCESSING'] } } }),
  ])

  if (activeDeployments > 0 || pendingPayslips > 0) {
    return NextResponse.json({ error: 'Cannot delete guard with active deployments or pending payslips' }, { status: 409 })
  }

  await prisma.guard.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name, action: 'DELETE', module: 'Guard', recordId: params.id, oldValues: guard })
  return NextResponse.json({ success: true })
}
