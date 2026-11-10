import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { checkLockDate } from '@/lib/lock-dates'
import { apiError, ApiError } from '@/lib/api-error'
import { applyBalanceDeltas } from '@/lib/gl-posting'
import { normaliseJournalLines, assertAccountsUsable } from '@/lib/journal-rules'
import { sumMoney } from '@/lib/money'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.journalEntry.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lines = await prisma.journalLine.findMany({ where: { journalEntryId: params.id } })
  const accountIds = Array.from(new Set(lines.map((line) => line.accountId).filter(Boolean)))
  const accounts = await prisma.chartOfAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, account_name: true, account_code: true, account_type: true },
  })
  const accountMap = Object.fromEntries(accounts.map((account) => [account.id, account]))

  const mappedLines = lines.map((line) => ({
    ...line,
    account: {
      id: line.accountId,
      name: accountMap[line.accountId]?.account_name ?? '',
      accountCode: accountMap[line.accountId]?.account_code ?? '',
      type: accountMap[line.accountId]?.account_type ?? 'ASSET',
    },
  }))

  return NextResponse.json({ entry: { ...entry, lines: mappedLines } })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const action = new URL(req.url).searchParams.get('action')
  const entry = await prisma.journalEntry.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lines = await prisma.journalLine.findMany({ where: { journalEntryId: params.id } })

  if (action === 'post') {
    if (entry.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only DRAFT entries can be posted', code: 'INVALID_STATE' }, { status: 409 })
    }
    if (entry.entry_date) {
      const lockError = await checkLockDate(session.companyId, new Date(entry.entry_date))
      if (lockError) return NextResponse.json({ error: lockError, code: 'PERIOD_LOCKED' }, { status: 422 })
    }

    try {
      // Drafts were saved before these rules existed (RS-JE-000509 pointed
      // at a missing account and 500'd on post); re-check before posting.
      const normalised = normaliseJournalLines(lines)
      await assertAccountsUsable(prisma, session.companyId, normalised.map((l) => l.accountId))
      const total = sumMoney(normalised.map((l) => l.debit))

      await prisma.$transaction(async (tx) => {
        // Claim the DRAFT -> POSTED transition so a double-click can't apply
        // the balance deltas twice.
        const claimed = await tx.journalEntry.updateMany({
          where: { id: params.id, status: 'DRAFT' },
          data: { status: 'POSTED', total_debit: total, total_credit: total, is_balanced: true, updated_date: new Date().toISOString() },
        })
        if (claimed.count === 0) throw new ApiError('This entry is no longer a draft', 409, 'INVALID_STATE')
        await applyBalanceDeltas(tx, normalised)
      }, { timeout: 60000 })
    } catch (err) {
      return apiError(err, 'Failed to post entry', 400)
    }

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'JournalEntries',
      recordId: params.id,
      newValues: { status: 'POSTED' },
    })

    return NextResponse.json({ success: true, status: 'POSTED' })
  }

  if (action === 'void') {
    if (entry.status === 'VOID') {
      return NextResponse.json({ error: 'Entry is already voided' }, { status: 400 })
    }
    if (entry.entry_date) {
      const lockError = await checkLockDate(session.companyId, new Date(entry.entry_date))
      if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })
    }

    const wasPosted = entry.status === 'POSTED'

    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.journalEntry.updateMany({
          where: { id: params.id, status: { not: 'VOID' } },
          data: { status: 'VOID', updated_date: new Date().toISOString() },
        })
        if (claimed.count === 0) throw new ApiError('Entry is already voided', 409, 'INVALID_STATE')
        // Reverse by swapping debit and credit.
        if (wasPosted) await applyBalanceDeltas(tx, lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })))
      }, { timeout: 60000 })
    } catch (err) {
      return apiError(err, 'Failed to void entry', 400)
    }

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'UPDATE',
      module: 'JournalEntries',
      recordId: params.id,
      newValues: { status: 'VOID' },
    })

    return NextResponse.json({ success: true, status: 'VOID' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
