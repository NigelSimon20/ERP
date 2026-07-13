import crypto from 'crypto'
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
  id: string
  companyId: string
  name: string
  itemType: string
  calculationMethod: string
  fixedAmount: unknown
  percentage: unknown
  taxable: boolean
  active: boolean
  createdAt: Date
}) {
  return {
    ...item,
    type: item.itemType,
    amount: Number(item.fixedAmount ?? 0),
    percentage: Number(item.percentage ?? 0),
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.payslipItem.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ itemType: 'asc' }, { name: 'asc' }],
  })

  const mappedItems = items.map(mapPayslipItem)

  return NextResponse.json({
    items: mappedItems,
    earnings: mappedItems.filter((i) => i.type === 'EARNING'),
    deductions: mappedItems.filter((i) => i.type === 'DEDUCTION'),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, type, calculationMethod, amount, percentage, taxable } = body

  if (!name || !type || !calculationMethod) {
    return NextResponse.json({ error: 'name, type, calculationMethod required' }, { status: 400 })
  }
  if (!['EARNING', 'DEDUCTION'].includes(type)) {
    return NextResponse.json({ error: 'type must be EARNING or DEDUCTION' }, { status: 400 })
  }

  const item = await prisma.payslipItem.create({
    data: {
      id: crypto.randomUUID(),
      companyId: session.companyId,
      name,
      itemType: type,
      calculationMethod,
      fixedAmount: calculationMethod === 'FIXED' ? Number(amount) : null,
      percentage: calculationMethod !== 'FIXED' ? Number(percentage) : null,
      taxable: taxable ?? true,
      active: true,
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'PayslipItems', recordId: item.id })
  return NextResponse.json({ item: mapPayslipItem(item) }, { status: 201 })
}
