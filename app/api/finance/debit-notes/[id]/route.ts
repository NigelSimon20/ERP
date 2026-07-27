import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { postDebitNoteToGL } from '@/lib/gl-posting'
import { recalculateSupplierOutstandingBalance } from '@/lib/finance-recalculation'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const debitNote = await prisma.debitNote.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!debitNote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [supplier, lineItems] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: debitNote.supplierId }, select: { id: true, company_name: true } }),
    prisma.debitNoteLine.findMany({ where: { debitNoteId: debitNote.id } }),
  ])

  return NextResponse.json({ debitNote: { ...debitNote, supplier: { id: supplier?.id ?? debitNote.supplierId, name: supplier?.company_name ?? '' }, lineItems } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.debitNote.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'issue') {
    if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT debit notes can be issued' }, { status: 409 })

    const lockDate = await prisma.lockDate.findFirst({ where: { companyId, lockedUntil: { gte: existing.issueDate } } })
    if (lockDate) return NextResponse.json({ error: `Period is locked until ${lockDate.lockedUntil.toLocaleDateString()}` }, { status: 422 })

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { payablesAccountId: true } })
    if (!company?.payablesAccountId) return NextResponse.json({ error: 'Accounts Payable account is not configured. Set it in Settings → Company → Tax.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const expenseAccount = await prisma.chartOfAccount.findFirst({ where: { id: body.expenseAccountId, companyId, account_type: 'EXPENSE' } })
    if (!expenseAccount) return NextResponse.json({ error: 'A valid expense account (expenseAccountId) is required to issue a debit note' }, { status: 400 })

    const claimed = await prisma.debitNote.updateMany({ where: { id: params.id, status: 'DRAFT' }, data: { status: 'ISSUED' } })
    if (claimed.count === 0) return NextResponse.json({ error: 'This debit note is no longer DRAFT' }, { status: 409 })

    const updated = await prisma.$transaction(async (tx) => {
      await postDebitNoteToGL(tx, {
        companyId, debitNoteId: existing.id, debitNoteNumber: existing.debitNoteNumber,
        entryDate: existing.issueDate.toISOString(), totalAmount: existing.totalAmount,
        payableAccountId: company.payablesAccountId!, expenseAccountId: expenseAccount.id, userId,
      })
      await recalculateSupplierOutstandingBalance(tx, existing.supplierId, companyId)
      return tx.debitNote.findUniqueOrThrow({ where: { id: params.id } })
    }, { timeout: 60000 })

    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'DebitNotes', recordId: params.id, oldValues: { status: 'DRAFT' }, newValues: { status: 'ISSUED' } })
    return NextResponse.json({ debitNote: updated })
  }

  if (action === 'void') {
    if (existing.status === 'VOID') return NextResponse.json({ error: 'Already voided' }, { status: 409 })

    const wasIssued = existing.status === 'ISSUED'
    const updated = await prisma.$transaction(async (tx) => {
      if (wasIssued && existing.journalEntryId) {
        const { reverseJournalEntry } = await import('@/lib/gl-posting')
        await reverseJournalEntry(tx, existing.journalEntryId)
      }
      const dn = await tx.debitNote.update({ where: { id: params.id }, data: { status: 'VOID' } })
      if (wasIssued) await recalculateSupplierOutstandingBalance(tx, existing.supplierId, companyId)
      return dn
    })

    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'DebitNotes', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'VOID' } })
    return NextResponse.json({ debitNote: updated })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}
