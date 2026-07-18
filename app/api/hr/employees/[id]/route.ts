import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { toGuardDto, splitName } from '@/lib/guards'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await prisma.guard.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })

  if (!guard) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ guard: toGuardDto(guard) })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.guard.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, idNumber, phone, whatsapp, email, address, department, position, rank, dailyRate, basicSalary, status, dateOfBirth, dateHired } = body
  const { first_name, last_name } = name ? splitName(name) : { first_name: undefined, last_name: undefined }

  const guard = await prisma.guard.update({
    where: { id: params.id },
    data: {
      ...(name ? { full_name: name, first_name, last_name } : {}),
      ...(idNumber !== undefined ? { national_id: idNumber || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(whatsapp !== undefined ? { whatsapp: whatsapp || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
      ...(department !== undefined ? { department: department || null } : {}),
      ...(position !== undefined ? { position: position || null } : {}),
      ...(rank !== undefined ? { employee_type: rank || null } : {}),
      ...(dailyRate != null ? { daily_rate: Number(dailyRate) } : {}),
      ...(basicSalary != null ? { basic_salary: Number(basicSalary) } : {}),
      ...(status ? { status } : {}),
      ...(dateOfBirth !== undefined ? { date_of_birth: dateOfBirth || null } : {}),
      ...(dateHired !== undefined ? { hire_date: dateHired || null } : {}),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'Guard', recordId: guard.id, oldValues: existing, newValues: guard })
  return NextResponse.json({ guard: toGuardDto(guard) })
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
