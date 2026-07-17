import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextInvoiceNumber } from '@/lib/auto-numbers'
import { toDbInvoiceStatus } from '@/lib/invoice-status'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const quotation = await prisma.quotation.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: { lead: true },
  })
  if (!quotation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ quotation })
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
    if (existing.status !== 'ACCEPTED') {
      return NextResponse.json({ error: 'Only ACCEPTED quotations can be converted to invoices' }, { status: 400 })
    }
    if (!existing.customerId) {
      return NextResponse.json({ error: 'Quotation must be linked to a customer to convert to invoice' }, { status: 400 })
    }

    const invoiceNumber = await nextInvoiceNumber(companyId)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    const invoice = await prisma.salesInvoice.create({
      data: {
        id: crypto.randomUUID(),
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

    await prisma.quotation.update({ where: { id: params.id }, data: { status: 'ACCEPTED' } })
    await logAudit({ companyId, userId, userName: 'System', action: 'CREATE', module: 'BD', recordId: invoice.id, newValues: { source: 'quotation', quoteNumber: existing.quoteNumber } })
    return NextResponse.json({ invoiceId: invoice.id, invoiceNumber })
  }

  // ── Standard update (DRAFT only) ─────────────────────────────────────────
  if (existing.status !== 'DRAFT') {
    // Allow status update for non-draft (e.g., SENT→ACCEPTED)
    const body = await req.json()
    if (body.status && ['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'].includes(body.status)) {
      const updated = await prisma.quotation.update({ where: { id: params.id }, data: { status: body.status } })
      return NextResponse.json({ quotation: updated })
    }
    return NextResponse.json({ error: 'Only DRAFT quotations can be fully edited' }, { status: 409 })
  }

  const body = await req.json()
  const { customerId, leadId, issueDate, validUntil, notes, status, subtotal, tax, total } = body

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
      ...(tax !== undefined ? { tax: Number(tax) } : {}),
      ...(total !== undefined ? { total: Number(total) } : {}),
    },
    include: { lead: { select: { companyName: true } } },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'BD', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: updated.status } })
  return NextResponse.json({ quotation: updated })
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
