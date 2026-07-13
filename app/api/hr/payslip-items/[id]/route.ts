import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.payslipItem.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'toggle') {
    const item = await prisma.payslipItem.update({
      where: { id: params.id },
      data: { active: !existing.active },
    })
    await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'PayslipItem', recordId: item.id, oldValues: { active: existing.active }, newValues: { active: item.active } })
    return NextResponse.json({ item })
  }

  const body = await req.json()
  const { name, calculationMethod, fixedAmount, percentage, taxable } = body

  const item = await prisma.payslipItem.update({
    where: { id: params.id },
    data: {
      ...(name ? { name } : {}),
      ...(calculationMethod ? { calculationMethod } : {}),
      ...(fixedAmount !== undefined ? { fixedAmount: fixedAmount != null ? Number(fixedAmount) : null } : {}),
      ...(percentage !== undefined ? { percentage: percentage != null ? Number(percentage) : null } : {}),
      ...(taxable !== undefined ? { taxable } : {}),
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'PayslipItem', recordId: item.id, oldValues: existing, newValues: item })
  return NextResponse.json({ item })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.payslipItem.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.payslipItem.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name, action: 'DELETE', module: 'PayslipItem', recordId: params.id, oldValues: existing })
  return NextResponse.json({ success: true })
}
