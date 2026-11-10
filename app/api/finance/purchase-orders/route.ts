import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'
import { nextPoNumber } from '@/lib/auto-numbers'
import { calculateInvoiceLineTotal, calculateInvoiceTotals } from '@/lib/calculations'
import { apiError } from '@/lib/api-error'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const supplierId = searchParams.get('supplierId') || undefined
  const page = Number(searchParams.get('page') ?? '1')

  const where: any = { companyId: session.companyId, ...(status && { status }), ...(supplierId && { supplierId }) }

  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({ where, orderBy: { issueDate: 'desc' }, ...paginate(page) }),
    prisma.purchaseOrder.count({ where }),
  ])

  const supplierIds = Array.from(new Set(rows.map((r) => r.supplierId)))
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, company_name: true } })
    : []
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.company_name]))

  return NextResponse.json({
    purchaseOrders: rows.map((r) => ({ ...r, supplier: { id: r.supplierId, name: supplierMap[r.supplierId] ?? '' } })),
    total,
    page,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { supplierId, issueDate, expectedDate, notes, lineItems } = body
    if (!supplierId || !issueDate) return NextResponse.json({ error: 'supplierId, issueDate required' }, { status: 400 })
    if (!Array.isArray(lineItems) || lineItems.length === 0) return NextResponse.json({ error: 'At least one line item required' }, { status: 400 })

    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, companyId: session.companyId } })
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

    const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { showVat: true, taxInclusive: true } })
    const taxEnabled = company?.showVat ?? true
    const taxInclusive = company?.taxInclusive ?? false

    const lines = (lineItems as { description: string; quantity: number; unitPrice: number; taxRate?: number }[]).map((item) => {
      const taxRate = taxEnabled ? (item.taxRate ?? 0) : 0
      const { lineTotal, taxAmount } = calculateInvoiceLineTotal(item.quantity, item.unitPrice, taxRate, taxInclusive)
      return { ...item, taxRate, lineTotal, taxAmount }
    })
    const { subtotal, taxAmount, totalAmount } = calculateInvoiceTotals(lines, 0, taxInclusive)
    const poNumber = await nextPoNumber(session.companyId)

    const po = await prisma.$transaction(async (tx) => {
      const p = await tx.purchaseOrder.create({
        data: {
          companyId: session.companyId,
          supplierId,
          poNumber,
          issueDate: new Date(issueDate),
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          subtotal, taxAmount, totalAmount,
          notes: notes || null,
        },
      })
      await tx.purchaseOrderLine.createMany({
        data: lines.map((l) => ({ purchaseOrderId: p.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, lineTotal: l.lineTotal })),
      })
      return p
    })

    await logAudit({
      companyId: session.companyId, userId: session.userId, userName: session.name,
      action: 'CREATE', module: 'PurchaseOrders', recordId: po.id,
      newValues: { poNumber, supplier: supplier.company_name ?? '', totalAmount },
    })

    return NextResponse.json({ purchaseOrder: { ...po, supplier: { id: supplier.id, name: supplier.company_name ?? '' } } }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
