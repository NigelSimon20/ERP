import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextQuoteNumber } from '@/lib/auto-numbers'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const quotations = await prisma.quotation.findMany({
    where: { companyId: session.companyId },
    include: {
      lead: { select: { id: true, companyName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ quotations })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { customerId, leadId, issueDate, validUntil, notes, items } = body

  if (!customerId && !leadId) return NextResponse.json({ error: 'customerId or leadId is required' }, { status: 400 })
  if (!items?.length) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

  const quoteNumber = await nextQuoteNumber(companyId)

  let subtotal = 0
  let taxAmount = 0
  const processedItems = (items as { description: string; quantity: number; unitPrice: number; taxRate?: number }[]).map((item) => {
    const lineSubtotal = Math.round(item.quantity * item.unitPrice * 100) / 100
    const lineTax = Math.round(lineSubtotal * ((item.taxRate ?? 0) / 100) * 100) / 100
    subtotal += lineSubtotal
    taxAmount += lineTax
    return { ...item, lineTotal: lineSubtotal + lineTax, subtotal: lineSubtotal, taxAmount: lineTax }
  })
  subtotal = Math.round(subtotal * 100) / 100
  taxAmount = Math.round(taxAmount * 100) / 100
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100

  const quotation = await prisma.quotation.create({
    data: {
      id: crypto.randomUUID(), companyId, quoteNumber,
      customerId: customerId || null, leadId: leadId || null,
      issueDate: new Date(issueDate), validUntil: new Date(validUntil || new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
      status: 'DRAFT', subtotal, tax: taxAmount, total: totalAmount,
      notes: notes || null,
      updatedAt: new Date(),
    },
    include: { lead: { select: { companyName: true } } },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'CREATE', module: 'BD', recordId: quotation.id, newValues: { quoteNumber, total: totalAmount } })
  return NextResponse.json({ quotation }, { status: 201 })
}
