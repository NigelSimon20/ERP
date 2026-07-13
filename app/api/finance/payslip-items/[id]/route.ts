import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

function mapPayslipItem(item: {
  id: string; companyId: string; name: string; itemType: string;
  calculationMethod: string; fixedAmount: unknown; percentage: unknown;
  taxable: boolean; active: boolean; createdAt: Date
}) {
  return { ...item, type: item.itemType, amount: Number(item.fixedAmount ?? 0), percentage: Number(item.percentage ?? 0) }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.payslipItem.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: mapPayslipItem(item) })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.payslipItem.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'toggle') {
    const updated = await prisma.payslipItem.update({ where: { id: params.id }, data: { active: !item.active } })
    return NextResponse.json({ item: mapPayslipItem(updated) })
  }

  const body = await req.json()
  const { name, type, calculationMethod, amount, percentage, taxable, active } = body

  const updated = await prisma.payslipItem.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(type && { itemType: type }),
      ...(calculationMethod && { calculationMethod }),
      ...(amount !== undefined && { fixedAmount: Number(amount) }),
      ...(percentage !== undefined && { percentage: Number(percentage) }),
      ...(taxable !== undefined && { taxable }),
      ...(active !== undefined && { active }),
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'PayslipItems', recordId: params.id, oldValues: item, newValues: updated })
  return NextResponse.json({ item: mapPayslipItem(updated) })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.payslipItem.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.payslipItem.delete({ where: { id: params.id } })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'PayslipItems', recordId: params.id })
  return NextResponse.json({ success: true })
}
