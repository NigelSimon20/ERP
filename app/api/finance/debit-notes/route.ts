import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate, pageLimit } from '@/lib/utils'
import { nextDebitNoteNumber } from '@/lib/auto-numbers'
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
    prisma.debitNote.findMany({ where, orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], ...paginate(page, pageLimit(searchParams)) }),
    prisma.debitNote.count({ where }),
  ])

  const supplierIds = Array.from(new Set(rows.map((r) => r.supplierId)))
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, company_name: true } })
    : []
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.company_name]))

  return NextResponse.json({
    debitNotes: rows.map((r) => ({ ...r, supplier: { id: r.supplierId, name: supplierMap[r.supplierId] ?? '' } })),
    total,
    page,
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { issueDate, reason, lineItems } = body
    // A2: the bill may come as invoiceId or purchaseInvoiceId; when given, the
    // supplier is the bill's (and a different one is rejected).
    const purchaseInvoiceId: string | null = body.invoiceId || body.purchaseInvoiceId || null
    let supplierId: string | undefined = body.supplierId
    if (purchaseInvoiceId) {
      const bill = await prisma.purchaseInvoice.findFirst({ where: { id: purchaseInvoiceId, companyId: session.companyId }, select: { supplierId: true, status: true } })
      if (!bill) return NextResponse.json({ error: 'Bill not found', code: 'NOT_FOUND' }, { status: 404 })
      if (bill.status === 'VOID') return NextResponse.json({ error: 'That bill has been voided', code: 'INVALID_STATE' }, { status: 409 })
      if (supplierId && supplierId !== bill.supplierId) {
        return NextResponse.json({ error: 'The supplier does not match the bill’s supplier', code: 'SUPPLIER_MISMATCH' }, { status: 400 })
      }
      supplierId = bill.supplierId
    }
    if (!supplierId || !issueDate || !reason) return NextResponse.json({ error: 'supplierId (or invoiceId), issueDate, reason required', code: 'VALIDATION_ERROR' }, { status: 400 })
    if (!Array.isArray(lineItems) || lineItems.length === 0) return NextResponse.json({ error: 'At least one line item required', code: 'VALIDATION_ERROR' }, { status: 400 })

    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, companyId: session.companyId } })
    if (!supplier) return NextResponse.json({ error: 'Supplier not found', code: 'NOT_FOUND' }, { status: 404 })

    const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { showVat: true, taxInclusive: true } })
    const taxEnabled = company?.showVat ?? true
    const taxInclusive = company?.taxInclusive ?? false

    const lines = (lineItems as { description: string; quantity: number; unitPrice: number; taxRate?: number }[]).map((item) => {
      const taxRate = taxEnabled ? (item.taxRate ?? 0) : 0
      const { lineTotal, taxAmount } = calculateInvoiceLineTotal(item.quantity, item.unitPrice, taxRate, taxInclusive)
      return { ...item, taxRate, lineTotal, taxAmount }
    })
    const { subtotal, taxAmount, totalAmount } = calculateInvoiceTotals(lines, 0, taxInclusive)
    const debitNoteNumber = await nextDebitNoteNumber(session.companyId)

    const debitNote = await prisma.$transaction(async (tx) => {
      const dn = await tx.debitNote.create({
        data: {
          companyId: session.companyId,
          supplierId: supplier.id,
          purchaseInvoiceId: purchaseInvoiceId || null,
          debitNoteNumber,
          issueDate: new Date(issueDate),
          reason,
          subtotal, taxAmount, totalAmount,
        },
      })
      await tx.debitNoteLine.createMany({
        data: lines.map((l) => ({ debitNoteId: dn.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, lineTotal: l.lineTotal })),
      })
      return dn
    })

    await logAudit({
      companyId: session.companyId, userId: session.userId, userName: session.name,
      action: 'CREATE', module: 'DebitNotes', recordId: debitNote.id,
      newValues: { debitNoteNumber, supplier: supplier.company_name ?? '', totalAmount },
    })

    return NextResponse.json({ debitNote: { ...debitNote, supplier: { id: supplier.id, name: supplier.company_name ?? '' } } }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
