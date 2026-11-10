import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { postCreditNoteToGL } from '@/lib/gl-posting'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { apiError, ApiError } from '@/lib/api-error'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const creditNote = await prisma.creditNote.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!creditNote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [customer, lineItems] = await Promise.all([
    prisma.customer.findUnique({ where: { id: creditNote.customerId }, select: { id: true, company_name: true } }),
    prisma.creditNoteLine.findMany({ where: { creditNoteId: creditNote.id } }),
  ])

  return NextResponse.json({ creditNote: { ...creditNote, customer: { id: customer?.id ?? creditNote.customerId, name: customer?.company_name ?? '' }, lineItems } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')

  const existing = await prisma.creditNote.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'issue') {
    if (existing.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT credit notes can be issued' }, { status: 409 })

    const lockDate = await prisma.lockDate.findFirst({ where: { companyId, lockedUntil: { gte: existing.issueDate } } })
    if (lockDate) return NextResponse.json({ error: `Period is locked until ${lockDate.lockedUntil.toLocaleDateString()}` }, { status: 422 })

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { receivablesAccountId: true, vatAccountId: true } })
    if (!company?.receivablesAccountId) return NextResponse.json({ error: 'Accounts Receivable account is not configured. Set it in Settings → Company → Tax.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const revenueAccount = await prisma.chartOfAccount.findFirst({ where: { id: body.revenueAccountId, companyId, account_type: 'REVENUE' } })
    if (!revenueAccount) return NextResponse.json({ error: 'A valid revenue account (revenueAccountId) is required to issue a credit note' }, { status: 400 })
    const vatAccount = company.vatAccountId ? await prisma.chartOfAccount.findFirst({ where: { id: company.vatAccountId, companyId } }) : null

    // The DRAFT -> ISSUED claim is inside the transaction: if posting fails,
    // the note stays a draft instead of ISSUED with no journal behind it.
    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.creditNote.updateMany({ where: { id: params.id, status: 'DRAFT' }, data: { status: 'ISSUED' } })
        if (claimed.count === 0) throw new ApiError('This credit note is no longer DRAFT', 409, 'INVALID_STATE')
        await postCreditNoteToGL(tx, {
          companyId, creditNoteId: existing.id, creditNoteNumber: existing.creditNoteNumber,
          entryDate: existing.issueDate.toISOString(), subtotal: Number(existing.subtotal), taxAmount: Number(existing.taxAmount),
          totalAmount: Number(existing.totalAmount), receivablesAccountId: company.receivablesAccountId!,
          revenueAccountId: revenueAccount.id, vatAccountId: vatAccount?.id ?? null, userId,
        })
        await recalculateCustomerOutstandingBalance(tx, existing.customerId)
        return tx.creditNote.findUniqueOrThrow({ where: { id: params.id } })
      }, { timeout: 60000 })
    } catch (err) {
      return apiError(err, 'Failed to issue', 400)
    }

    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'POST', module: 'CreditNotes', recordId: params.id, oldValues: { status: 'DRAFT' }, newValues: { status: 'ISSUED' } })
    return NextResponse.json({ creditNote: updated })
  }

  if (action === 'void') {
    if (existing.status === 'VOID') return NextResponse.json({ error: 'Already voided' }, { status: 409 })

    const wasIssued = existing.status === 'ISSUED'
    const updated = await prisma.$transaction(async (tx) => {
      if (wasIssued && existing.journalEntryId) {
        const { reverseJournalEntry } = await import('@/lib/gl-posting')
        await reverseJournalEntry(tx, existing.journalEntryId)
      }
      const cn = await tx.creditNote.update({ where: { id: params.id }, data: { status: 'VOID' } })
      if (wasIssued) await recalculateCustomerOutstandingBalance(tx, existing.customerId)
      return cn
    })

    await logAudit({ companyId, userId, userName: session.name || 'System', action: 'VOID', module: 'CreditNotes', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: 'VOID' } })
    return NextResponse.json({ creditNote: updated })
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}
