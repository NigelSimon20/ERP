import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextInvoiceNumber } from '@/lib/auto-numbers'
import { toDbInvoiceStatus } from '@/lib/invoice-status'

function mapQuotation(q: { subtotal: unknown; tax: unknown; total: unknown; [k: string]: unknown }) {
  const { subtotal, tax, total, ...rest } = q
  return { ...rest, subtotal: Number(subtotal), taxAmount: Number(tax), totalAmount: Number(total) }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const quotation = await prisma.quotation.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: { lead: true },
  })
  if (!quotation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const items = await prisma.quotationItem.findMany({ where: { quotationId: quotation.id } })

  // Same manual attach as GET / -- Quotation.customerId has no Prisma relation.
  const customer = quotation.customerId
    ? await prisma.customer.findUnique({ where: { id: quotation.customerId }, select: { id: true, company_name: true } })
    : null

  return NextResponse.json({
    quotation: {
      ...mapQuotation(quotation),
      customer: customer ? { id: customer.id, name: customer.company_name } : null,
      items: items.map((i) => ({ id: i.id, description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate ?? 0), lineTotal: Number(i.total) })),
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.quotation.findFirst({
    where: { id: params.id, companyId },
    include: { lead: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── Convert to Invoice ────────────────────────────────────────────────────
  if (action === 'convert-to-invoice') {
    if (existing.convertedInvoiceId) {
      return NextResponse.json({ error: 'This quotation has already been converted to an invoice' }, { status: 409 })
    }
    if (existing.status !== 'ACCEPTED') {
      return NextResponse.json({ error: 'Only ACCEPTED quotations can be converted to invoices' }, { status: 400 })
    }
    if (!existing.customerId) {
      return NextResponse.json({ error: 'Quotation must be linked to a customer to convert to invoice' }, { status: 400 })
    }

    const invoiceNumber = await nextInvoiceNumber(companyId)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)
    const invoiceId = crypto.randomUUID()

    // Claim the quotation atomically before creating the invoice — if two
    // requests race, only one can flip convertedInvoiceId from null, so only
    // one invoice is ever created for a given quotation.
    const claimed = await prisma.quotation.updateMany({
      where: { id: params.id, convertedInvoiceId: null },
      data: { convertedInvoiceId: invoiceId },
    })
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'This quotation has already been converted to an invoice' }, { status: 409 })
    }

    const invoice = await prisma.salesInvoice.create({
      data: {
        id: invoiceId,
        companyId,
        invoice_number: invoiceNumber,
        customer_id: existing.customerId,
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        status: toDbInvoiceStatus('UNPAID'),
        subtotal: Number(existing.subtotal),
        tax_amount: Number(existing.tax),
        total_amount: Number(existing.total),
        amount_paid: 0,
        balance_due: Number(existing.total),
        notes: existing.notes,
      },
    })

    await logAudit({ companyId, userId, userName: 'System', action: 'CREATE', module: 'BD', recordId: invoice.id, newValues: { source: 'quotation', quoteNumber: existing.quoteNumber } })
    return NextResponse.json({ invoiceId: invoice.id, invoiceNumber })
  }

  // ── Standard update (DRAFT only) ─────────────────────────────────────────
  if (existing.status !== 'DRAFT') {
    // Allow status update for non-draft (e.g., SENT→ACCEPTED)
    const body = await req.json()
    if (body.status && ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'].includes(body.status)) {
      const updated = await prisma.quotation.update({ where: { id: params.id }, data: { status: body.status } })
      return NextResponse.json({ quotation: mapQuotation(updated) })
    }
    return NextResponse.json({ error: 'Only DRAFT quotations can be fully edited' }, { status: 409 })
  }

  const body = await req.json()
  const { customerId, leadId, issueDate, validUntil, notes, status, subtotal, tax, taxAmount, total, totalAmount } = body

  const updated = await prisma.quotation.update({
    where: { id: params.id },
    data: {
      ...(customerId !== undefined ? { customerId: customerId || null } : {}),
      ...(leadId !== undefined ? { leadId: leadId || null } : {}),
      ...(issueDate ? { issueDate: new Date(issueDate) } : {}),
      ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(status ? { status } : {}),
      ...(subtotal !== undefined ? { subtotal: Number(subtotal) } : {}),
      ...((tax ?? taxAmount) !== undefined ? { tax: Number(tax ?? taxAmount) } : {}),
      ...((total ?? totalAmount) !== undefined ? { total: Number(total ?? totalAmount) } : {}),
    },
    include: { lead: { select: { companyName: true } } },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'BD', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: updated.status } })
  return NextResponse.json({ quotation: mapQuotation(updated) })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.quotation.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT quotations can be deleted' }, { status: 409 })

  await prisma.quotation.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'DELETE', module: 'BD', recordId: params.id, oldValues: { quoteNumber: existing.quoteNumber } })
  return NextResponse.json({ success: true })
}
