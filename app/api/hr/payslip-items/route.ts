import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.payslipItem.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ itemType: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json({
    items,
    earnings: items.filter((i) => i.itemType === 'EARNING'),
    deductions: items.filter((i) => i.itemType === 'DEDUCTION'),
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { name, type, calculationMethod, fixedAmount, percentage, taxable } = body

  if (!name || !type) return NextResponse.json({ error: 'name and type are required' }, { status: 400 })

  const item = await prisma.payslipItem.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      name,
      itemType: type,
      calculationMethod: calculationMethod || 'FIXED',
      fixedAmount: fixedAmount != null ? Number(fixedAmount) : null,
      percentage: percentage != null ? Number(percentage) : null,
      taxable: taxable !== false,
      active: true,
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'PayslipItem', recordId: item.id, newValues: item })
  return NextResponse.json({ item }, { status: 201 })
}
