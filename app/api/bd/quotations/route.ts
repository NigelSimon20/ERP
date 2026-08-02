import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextQuoteNumber } from '@/lib/auto-numbers'
import { calculateLineTotal, calculateInvoiceTotals } from '@/lib/calculations'

function mapQuotation(q: { subtotal: unknown; tax: unknown; total: unknown; [k: string]: unknown }) {
  const { subtotal, tax, total, ...rest } = q
  return { ...rest, subtotal: Number(subtotal), taxAmount: Number(tax), totalAmount: Number(total) }
}

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

  // Quotation.customerId has no Prisma relation to Customer (unlike leadId,
  // which does) -- attach it manually so the list/Convert-to-Invoice flow
  // can actually see which customer a quotation belongs to.
  const customerIds = Array.from(new Set(quotations.map((q) => q.customerId).filter((v): v is string => !!v)))
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, company_name: true } })
    : []
  const customerById = new Map(customers.map((c) => [c.id, c]))

  return NextResponse.json({
    quotations: quotations.map((q) => ({
      ...mapQuotation(q),
      customer: q.customerId && customerById.has(q.customerId) ? { id: q.customerId, name: customerById.get(q.customerId)!.company_name } : null,
    })),
  })
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

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { showVat: true, taxInclusive: true } })
  const taxEnabled = company?.showVat ?? true
  const taxInclusive = company?.taxInclusive ?? false

  const processedItems = (items as { description: string; quantity: number; unitPrice: number; taxRate?: number }[]).map((item) => {
    const taxRate = taxEnabled ? (item.taxRate ?? 0) : 0
    const { subtotal, taxAmount, lineTotal } = calculateLineTotal(item.quantity, item.unitPrice, taxRate, taxInclusive)
    return { ...item, taxRate, lineTotal, subtotal, taxAmount }
  })
  const { subtotal, taxAmount, totalAmount } = calculateInvoiceTotals(processedItems, 0, taxInclusive)

  const quotationId = crypto.randomUUID()

  const quotation = await prisma.$transaction(async (tx) => {
    const created = await tx.quotation.create({
      data: {
        id: quotationId, companyId, quoteNumber,
        customerId: customerId || null, leadId: leadId || null,
        issueDate: new Date(issueDate), validUntil: new Date(validUntil || new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
        status: 'DRAFT', subtotal, tax: taxAmount, total: totalAmount,
        notes: notes || null,
        updatedAt: new Date(),
      },
      include: { lead: { select: { companyName: true } } },
    })

    await tx.quotationItem.createMany({
      data: processedItems.map((item) => ({
        id: crypto.randomUUID(),
        quotationId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate ?? 0,
        total: item.lineTotal,
      })),
    })

    return created
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'CREATE', module: 'BD', recordId: quotation.id, newValues: { quoteNumber, total: totalAmount } })
  return NextResponse.json({ quotation: { ...mapQuotation(quotation), items: processedItems } }, { status: 201 })
}
