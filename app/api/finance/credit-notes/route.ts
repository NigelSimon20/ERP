import { NextRequest, NextResponse } from 'next/server'
import { idempotentPost } from '@/lib/idempotency'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate, pageLimit } from '@/lib/utils'
import { nextCreditNoteNumber } from '@/lib/auto-numbers'
import { calculateInvoiceLineTotal, calculateInvoiceTotals } from '@/lib/calculations'
import { DB_STATUS_VOID } from '@/lib/invoice-status'
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
  const customerId = searchParams.get('customerId') || undefined
  const page = Number(searchParams.get('page') ?? '1')

  const where: any = { companyId: session.companyId, ...(status && { status }), ...(customerId && { customerId }) }

  const [rows, total] = await Promise.all([
    prisma.creditNote.findMany({ where, orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], ...paginate(page, pageLimit(searchParams)) }),
    prisma.creditNote.count({ where }),
  ])

  const customerIds = Array.from(new Set(rows.map((r) => r.customerId)))
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, company_name: true } })
    : []
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c.company_name]))

  return NextResponse.json({
    creditNotes: rows.map((r) => ({ ...r, customer: { id: r.customerId, name: customerMap[r.customerId] ?? '' } })),
    total,
    page,
  })
}

async function createCreditNote(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { issueDate, reason, lineItems } = body
    // A2: the invoice may come as invoiceId or salesInvoiceId; when given, the
    // customer is the invoice's (and a different one is rejected).
    const salesInvoiceId: string | null = body.invoiceId || body.salesInvoiceId || null
    let customerId: string | undefined = body.customerId
    if (salesInvoiceId) {
      const inv = await prisma.salesInvoice.findFirst({ where: { id: salesInvoiceId, companyId: session.companyId }, select: { customer_id: true, status: true } })
      if (!inv) return NextResponse.json({ error: 'Invoice not found', code: 'NOT_FOUND' }, { status: 404 })
      if (inv.status === DB_STATUS_VOID) return NextResponse.json({ error: 'That invoice has been voided', code: 'INVALID_STATE' }, { status: 409 })
      if (customerId && inv.customer_id && customerId !== inv.customer_id) {
        return NextResponse.json({ error: 'The customer does not match the invoice’s customer', code: 'CUSTOMER_MISMATCH' }, { status: 400 })
      }
      customerId = inv.customer_id ?? customerId
    }
    if (!customerId || !issueDate || !reason) return NextResponse.json({ error: 'customerId (or invoiceId), issueDate, reason required', code: 'VALIDATION_ERROR' }, { status: 400 })
    if (!Array.isArray(lineItems) || lineItems.length === 0) return NextResponse.json({ error: 'At least one line item required', code: 'VALIDATION_ERROR' }, { status: 400 })

    const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId: session.companyId } })
    if (!customer) return NextResponse.json({ error: 'Customer not found', code: 'NOT_FOUND' }, { status: 404 })

    const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { showVat: true, taxInclusive: true } })
    const taxEnabled = company?.showVat ?? true
    const taxInclusive = company?.taxInclusive ?? false

    const lines = (lineItems as { description: string; quantity: number; unitPrice: number; taxRate?: number }[]).map((item) => {
      const taxRate = taxEnabled ? (item.taxRate ?? 0) : 0
      const { lineTotal, taxAmount } = calculateInvoiceLineTotal(item.quantity, item.unitPrice, taxRate, taxInclusive)
      return { ...item, taxRate, lineTotal, taxAmount }
    })
    const { subtotal, taxAmount, totalAmount } = calculateInvoiceTotals(lines, 0, taxInclusive)
    const creditNoteNumber = await nextCreditNoteNumber(session.companyId)

    const creditNote = await prisma.$transaction(async (tx) => {
      const cn = await tx.creditNote.create({
        data: {
          companyId: session.companyId,
          customerId: customer.id,
          salesInvoiceId,
          creditNoteNumber,
          issueDate: new Date(issueDate),
          reason,
          subtotal, taxAmount, totalAmount,
        },
      })
      await tx.creditNoteLine.createMany({
        data: lines.map((l) => ({ creditNoteId: cn.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, lineTotal: l.lineTotal })),
      })
      return cn
    })

    await logAudit({
      companyId: session.companyId, userId: session.userId, userName: session.name,
      action: 'CREATE', module: 'CreditNotes', recordId: creditNote.id,
      newValues: { creditNoteNumber, customer: customer.company_name ?? '', totalAmount },
    })

    return NextResponse.json({ creditNote: { ...creditNote, customer: { id: customer.id, name: customer.company_name ?? '' } } }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}

// A7: an Idempotency-Key makes a retried create return the first response
// instead of creating a second document; without one nothing changes.
export async function POST(req: NextRequest) {
  return idempotentPost(req, 'POST /api/finance/credit-notes', () => createCreditNote(req))
}
