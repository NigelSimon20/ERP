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

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [suppliers, balances] = await Promise.all([
    prisma.supplier.findMany({
      where: { companyId: session.companyId },
      orderBy: { company_name: 'asc' },
    }),
    prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: { companyId: session.companyId, status: { not: 'VOID' } as any },
      _sum: { balanceDue: true },
      _count: { id: true },
      _max: { issueDate: true },
    }),
  ])

  const balanceMap = Object.fromEntries(balances.map((b) => [b.supplierId, b]))

  return NextResponse.json({
    suppliers: suppliers.map((s) => ({
      ...s,
      name: s.company_name ?? '',
      paymentTerms: s.payment_terms ?? 30,
      outstandingBal: Number(balanceMap[s.id]?._sum.balanceDue ?? 0),
      invoiceCount: balanceMap[s.id]?._count.id ?? 0,
      lastInvoiceDate: balanceMap[s.id]?._max.issueDate ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, phone, address, paymentTerms, creditLimit } = body

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supplier = await prisma.supplier.create({
    data: {
      id: crypto.randomUUID(),
      companyId: session.companyId,
      company_name: name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      payment_terms: paymentTerms ? Number(paymentTerms) : 30,
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'Suppliers', recordId: supplier.id })
  return NextResponse.json({ supplier }, { status: 201 })
}
