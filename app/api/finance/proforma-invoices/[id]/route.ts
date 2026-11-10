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

  const proforma = await prisma.proformaInvoice.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!proforma) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [customer, lineItems] = await Promise.all([
    prisma.customer.findUnique({ where: { id: proforma.customerId }, select: { id: true, company_name: true } }),
    prisma.proformaInvoiceLine.findMany({ where: { proformaInvoiceId: proforma.id } }),
  ])

  return NextResponse.json({
    proformaInvoice: { ...proforma, customer: { id: customer?.id ?? proforma.customerId, name: customer?.company_name ?? '' }, lineItems },
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.proformaInvoice.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'convert-to-invoice') {
    if (existing.convertedInvoiceId) {
      return NextResponse.json({ error: 'This proforma invoice has already been converted' }, { status: 409 })
    }
    if (existing.status === 'VOID' || existing.status === 'EXPIRED') {
      return NextResponse.json({ error: `Cannot convert a ${existing.status} proforma invoice` }, { status: 400 })
    }

    const invoiceNumber = await nextInvoiceNumber(companyId)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)
    const invoiceId = crypto.randomUUID()

    // Claim atomically -- mirrors the Quotation -> Invoice conversion race guard.
    const claimed = await prisma.proformaInvoice.updateMany({
      where: { id: params.id, convertedInvoiceId: null },
      data: { convertedInvoiceId: invoiceId, status: 'CONVERTED' },
    })
    if (claimed.count === 0) {
      return NextResponse.json({ error: 'This proforma invoice has already been converted' }, { status: 409 })
    }

    const lineItems = await prisma.proformaInvoiceLine.findMany({ where: { proformaInvoiceId: existing.id } })

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          id: invoiceId,
          companyId,
          invoice_number: invoiceNumber,
          customer_id: existing.customerId,
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          status: toDbInvoiceStatus('UNPAID'),
          subtotal: existing.subtotal,
          tax_amount: existing.taxAmount,
          total_amount: existing.totalAmount,
          amount_paid: 0,
          balance_due: existing.totalAmount,
          overall_description: existing.notes ?? '',
        },
      })
      await tx.salesInvoiceLine.createMany({
        data: lineItems.map((l) => ({
          id: crypto.randomUUID(),
          salesInvoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate ?? 0,
          lineTotal: l.lineTotal,
        })),
      })
      return inv
    })

    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'CREATE', module: 'ProformaInvoices', recordId: invoice.id, newValues: { source: 'proforma', proformaNumber: existing.proformaNumber } })
    return NextResponse.json({ invoiceId: invoice.id, invoiceNumber })
  }

  // The page voids with a bodyless PUT; a bare req.json() threw and 500'd.
  const body = await req.json().catch(() => ({}))

  if (action === 'void') {
    if (existing.convertedInvoiceId) return NextResponse.json({ error: 'Cannot void a converted proforma invoice' }, { status: 409 })
    const updated = await prisma.proformaInvoice.update({ where: { id: params.id }, data: { status: 'VOID' } })
    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'ProformaInvoices', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'VOID' } })
    return NextResponse.json({ proformaInvoice: updated })
  }

  if (existing.status !== 'DRAFT') {
    if (body.status && ['SENT', 'EXPIRED'].includes(body.status)) {
      const updated = await prisma.proformaInvoice.update({ where: { id: params.id }, data: { status: body.status } })
      return NextResponse.json({ proformaInvoice: updated })
    }
    return NextResponse.json({ error: 'Only DRAFT proforma invoices can be fully edited' }, { status: 409 })
  }

  const { customerId, issueDate, validUntil, notes, status } = body
  const updated = await prisma.proformaInvoice.update({
    where: { id: params.id },
    data: {
      ...(customerId !== undefined ? { customerId } : {}),
      ...(issueDate ? { issueDate: new Date(issueDate) } : {}),
      ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(status ? { status } : {}),
    },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'ProformaInvoices', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: updated.status } })
  return NextResponse.json({ proformaInvoice: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.proformaInvoice.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT proforma invoices can be deleted' }, { status: 409 })

  await prisma.proformaInvoiceLine.deleteMany({ where: { proformaInvoiceId: params.id } })
  await prisma.proformaInvoice.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'DELETE', module: 'ProformaInvoices', recordId: params.id, oldValues: { proformaNumber: existing.proformaNumber } })
  return NextResponse.json({ success: true })
}
