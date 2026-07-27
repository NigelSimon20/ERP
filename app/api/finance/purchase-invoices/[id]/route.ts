import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { calculateInvoiceLineTotal, calculateInvoiceTotals, calculateBalanceDue, determineInvoiceStatus } from '@/lib/calculations'
import { recalculateSupplierOutstandingBalance } from '@/lib/finance-recalculation'
import { checkLockDate } from '@/lib/lock-dates'
import { reverseJournalEntry, postPurchaseInvoiceToGL } from '@/lib/gl-posting'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      supplier: true,
      lineItems: true,
    },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    invoice: {
      ...invoice,
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceDue: Number(invoice.balanceDue),
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['DRAFT', 'UNPAID'].includes(invoice.status as string)) return NextResponse.json({ error: `Cannot edit a ${invoice.status} invoice` }, { status: 400 })
  if (invoice.issueDate) {
    const lockError = await checkLockDate(session.companyId, new Date(invoice.issueDate))
    if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })
  }

  const body = await req.json()
  const { issueDate, dueDate, description, notes, lineItems } = body

  const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { showVat: true, taxInclusive: true, payablesAccountId: true } })
  const taxEnabled = company?.showVat ?? true
  const taxInclusive = company?.taxInclusive ?? false

  const lines = lineItems?.map((l: { description: string; quantity: number; unitPrice: number; taxRate?: number }) => {
    const taxRate = taxEnabled ? (l.taxRate ?? 0) : 0
    const lineTotal = calculateInvoiceLineTotal(l.quantity, l.unitPrice, taxRate, taxInclusive)
    return { ...l, taxRate, ...lineTotal }
  })
  const totals = lines ? calculateInvoiceTotals(lines, 0, taxInclusive) : null

  // Resolved up front (not inside the transaction) so a missing mapping
  // returns a clean 400 instead of an uncaught rejection -- this route has
  // no surrounding try/catch.
  let apAccountId: string | null = null
  if (lines && totals && invoice.journalEntryId) {
    if (!company?.payablesAccountId) {
      return NextResponse.json({ error: 'Accounts Payable account is not configured. Set it in Settings → Company → Tax.' }, { status: 400 })
    }
    const apAccount = await prisma.chartOfAccount.findFirst({ where: { id: company.payablesAccountId, companyId: session.companyId } })
    if (!apAccount) {
      return NextResponse.json({ error: 'The configured Accounts Payable account no longer exists. Re-select it in Settings → Company → Tax.' }, { status: 400 })
    }
    apAccountId = apAccount.id
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (lines && totals) {
      await tx.purchaseInvoiceLineItem.deleteMany({ where: { purchaseInvoiceId: params.id } })
      await tx.purchaseInvoiceLineItem.createMany({
        data: lines.map((l: { description: string; quantity: number; unitPrice: number; taxRate: number; subtotal: number; taxAmount: number; lineTotal: number }) => ({
          id: crypto.randomUUID(), purchaseInvoiceId: params.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate, subtotal: l.subtotal, taxAmount: l.taxAmount, lineTotal: l.lineTotal,
        })),
      })
      const oldTotal = Number(invoice.totalAmount)
      const newTotal = totals.totalAmount
      await tx.supplier.update({ where: { id: invoice.supplierId }, data: { current_balance: { increment: newTotal - oldTotal } } })

      // The GL entry was posted for the old total — reverse it and post a
      // fresh one for the new total (same accounts), or it silently goes
      // stale the moment the invoice is edited.
      if (invoice.journalEntryId && apAccountId) {
        const oldLines = await tx.journalLine.findMany({ where: { journalEntryId: invoice.journalEntryId } })
        const expenseLine = oldLines.find((l) => l.accountId !== apAccountId)
        await reverseJournalEntry(tx, invoice.journalEntryId)
        if (expenseLine) {
          await postPurchaseInvoiceToGL(tx, {
            companyId: session.companyId,
            invoiceId: params.id,
            invoiceNumber: invoice.invoiceNumber,
            entryDate: new Date(issueDate ?? invoice.issueDate).toISOString(),
            totalAmount: newTotal,
            payableAccountId: apAccountId,
            expenseAccountId: expenseLine.accountId,
            userId: session.userId,
          })
        }
      }
    }

    return tx.purchaseInvoice.update({
      where: { id: params.id },
      data: {
        ...(issueDate && { issueDate: new Date(issueDate) }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...((description !== undefined || notes !== undefined) && { notes: description ?? notes }),
        ...(totals && {
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          balanceDue: calculateBalanceDue(totals.totalAmount, Number(invoice.paidAmount ?? 0)),
          status: determineInvoiceStatus(totals.totalAmount, Number(invoice.paidAmount ?? 0), new Date(dueDate ?? invoice.dueDate ?? new Date())) as any,
        }),
      },
    })
  }, { timeout: 60000 })

  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'PurchaseInvoices', recordId: params.id })
  return NextResponse.json({ invoice: { ...updated, totalAmount: Number(updated.totalAmount), paidAmount: Number(updated.paidAmount), balanceDue: Number(updated.balanceDue) } })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'void') {
    if ((invoice.status as string) === 'VOID') return NextResponse.json({ error: 'Already voided' }, { status: 400 })
    if (Number(invoice.paidAmount) > 0) return NextResponse.json({ error: 'Cannot void: payments exist' }, { status: 400 })
    if (invoice.issueDate) {
      const lockError = await checkLockDate(session.companyId, new Date(invoice.issueDate))
      if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.update({ where: { id: params.id }, data: { status: 'VOID' } })
      if (invoice.journalEntryId) {
        await reverseJournalEntry(tx, invoice.journalEntryId)
      }
      await recalculateSupplierOutstandingBalance(tx, invoice.supplierId, session.companyId)
      return inv
    }, { timeout: 60000 })
    await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'PurchaseInvoices', recordId: params.id, newValues: { status: 'VOID' } })
    return NextResponse.json({ invoice: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'UNPAID') return NextResponse.json({ error: 'Can only delete unpaid invoices' }, { status: 400 })
  if (invoice.issueDate) {
    const lockError = await checkLockDate(session.companyId, new Date(invoice.issueDate))
    if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })
  }

  await prisma.$transaction(async (tx) => {
    if (invoice.journalEntryId) {
      await reverseJournalEntry(tx, invoice.journalEntryId)
    }
    await tx.purchaseInvoiceLineItem.deleteMany({ where: { purchaseInvoiceId: params.id } })
    await tx.purchaseInvoice.delete({ where: { id: params.id } })
    await recalculateSupplierOutstandingBalance(tx, invoice.supplierId, session.companyId)
  }, { timeout: 60000 })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'PurchaseInvoices', recordId: params.id })
  return NextResponse.json({ success: true })
}
