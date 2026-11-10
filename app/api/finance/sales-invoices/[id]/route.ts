import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { checkLockDate } from '@/lib/lock-dates'
import { reverseJournalEntry } from '@/lib/gl-posting'
import { z } from 'zod'
import { apiError, ApiError } from '@/lib/api-error'

const updateSchema = z.object({
  dueDate: z.string().optional(),
  description: z.string().optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      lineItems: true,
    },
  })

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ invoice })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status === 'Void' || Number(invoice.amount_paid ?? 0) > 0) {
    return NextResponse.json({ error: 'Only unpaid invoices can be edited' }, { status: 400 })
  }

  try {
    const data = updateSchema.parse(await req.json())
    const updated = await prisma.salesInvoice.update({
      where: { id: params.id },
      data: {
        due_date: data.dueDate ?? undefined,
        overall_description: data.description,
        updated_date: new Date().toISOString(),
      },
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'SalesInvoices',
      recordId: params.id,
      newValues: data,
    })

    return NextResponse.json({ invoice: updated })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const action = new URL(req.url).searchParams.get('action')

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: { lineItems: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'void') {
    if (invoice.status === 'Void') {
      return NextResponse.json({ error: 'Invoice already voided' }, { status: 400 })
    }
    if (invoice.invoice_date) {
      const lockError = await checkLockDate(session.companyId, new Date(invoice.invoice_date))
      if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })
    }

    const customerId = invoice.customer_id

    try {
      await prisma.$transaction(async (tx) => {
        // BUG-026: voiding while receipts are allocated left them posted
        // against nothing (an orphan AR credit). Lock the row so a receipt
        // can't land mid-void, then refuse while any money is allocated.
        const [locked] = await tx.$queryRaw<{ amount_paid: unknown }[]>`SELECT amount_paid FROM sales_invoices WHERE id = ${params.id} FOR UPDATE`
        if (Number(locked?.amount_paid ?? 0) !== 0) {
          throw new ApiError('This invoice has receipts allocated to it. Reverse those receipts before voiding it.', 409, 'HAS_ALLOCATIONS')
        }
        await tx.salesInvoice.update({
          where: { id: params.id },
          data: { status: 'Void', updated_date: new Date().toISOString() },
        })
        if (invoice.journal_entry_id) {
          await reverseJournalEntry(tx, invoice.journal_entry_id)
        }
        if (customerId) {
          await recalculateCustomerOutstandingBalance(tx, customerId)
        }
      }, { timeout: 60000 })

      await logAudit({
        companyId: session.companyId,
        userId: session.userId,
        userName: session.name,
        action: 'UPDATE',
        module: 'SalesInvoices',
        recordId: params.id,
        newValues: { status: 'VOID' },
      })
    } catch (err) {
      return apiError(err, 'Failed to void invoice', 400)
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'pdf') {
    return NextResponse.json({ invoice })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status === 'Void' || Number(invoice.amount_paid ?? 0) > 0) {
    return NextResponse.json({ error: 'Only unpaid invoices can be deleted' }, { status: 400 })
  }
  if (invoice.invoice_date) {
    const lockError = await checkLockDate(session.companyId, new Date(invoice.invoice_date))
    if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })
  }

  const customerId = invoice.customer_id

  await prisma.$transaction(async (tx) => {
    if (invoice.journal_entry_id) {
      await reverseJournalEntry(tx, invoice.journal_entry_id)
    }
    await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: params.id } })
    await tx.salesInvoice.delete({ where: { id: params.id } })
    if (customerId) {
      await recalculateCustomerOutstandingBalance(tx, customerId)
    }
  }, { timeout: 60000 })

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'DELETE',
    module: 'SalesInvoices',
    recordId: params.id,
    oldValues: { invoiceNumber: invoice.invoice_number },
  })

  return NextResponse.json({ success: true })
}
