import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { round2dp } from '@/lib/calculations'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

interface RegisterEntry {
  date: string
  type: 'Receipt' | 'Payment' | 'Transfer In' | 'Transfer Out'
  reference: string
  description: string
  amount: number // signed: +in, -out
}

// A bank register is the full chronological transaction history for one
// account with a running balance — nothing in this codebase provides that
// today (bank-reconciliations is snapshot-only, payments/transfers pages are
// unscoped flat lists). Money movement against a BankAccount lives in two
// places: `Payment` (receipts and outgoing payments, distinguished by
// payment_type) and `BankTransfer` (moves between two accounts) — the
// unused legacy `Receipt` model is never written to by any route, so it's
// deliberately not queried here.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bankAccount = await prisma.bankAccount.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : null
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : null

  const [payments, transfersOut, transfersIn] = await Promise.all([
    prisma.payment.findMany({
      where: { bank_account_id: params.id, companyId: session.companyId },
      select: { payment_date: true, payment_number: true, payment_type: true, party_name: true, description: true, amount: true },
    }),
    prisma.bankTransfer.findMany({ where: { fromAccountId: params.id } }),
    prisma.bankTransfer.findMany({ where: { toAccountId: params.id } }),
  ])

  const entries: RegisterEntry[] = []

  for (const p of payments) {
    if (!p.payment_date) continue
    const isReceipt = p.payment_type === 'Customer Receipt'
    entries.push({
      date: p.payment_date,
      type: isReceipt ? 'Receipt' : 'Payment',
      reference: p.payment_number ?? '',
      description: p.description || p.party_name || p.payment_type || '',
      amount: isReceipt ? Number(p.amount ?? 0) : -Number(p.amount ?? 0),
    })
  }
  for (const t of transfersOut) {
    entries.push({ date: t.transferDate.toISOString(), type: 'Transfer Out', reference: t.reference, description: t.notes || 'Bank transfer', amount: -Number(t.amount) })
  }
  for (const t of transfersIn) {
    entries.push({ date: t.transferDate.toISOString(), type: 'Transfer In', reference: t.reference, description: t.notes || 'Bank transfer', amount: Number(t.amount) })
  }

  // Chronological walk over the FULL history (not just the requested window)
  // so a running balance shown for a filtered range is still correct — only
  // the returned rows are sliced to [from, to], the balance math isn't.
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let running = Number(bankAccount.opening_balance ?? 0)
  let openingBalanceAtFrom = running
  const rows: (RegisterEntry & { runningBalance: number })[] = []

  for (const e of entries) {
    running = round2dp(running + e.amount)
    const d = new Date(e.date)
    const afterFrom = !from || d >= from
    const beforeTo = !to || d <= to
    if (afterFrom && beforeTo) {
      rows.push({ ...e, runningBalance: running })
    } else if (!afterFrom) {
      openingBalanceAtFrom = running
    }
  }

  return NextResponse.json({
    bankAccount: {
      id: bankAccount.id,
      bankName: bankAccount.bank_name,
      accountNumber: bankAccount.account_number,
      currency: bankAccount.currency,
      currentBalance: Number(bankAccount.current_balance ?? 0),
    },
    rows,
    openingBalanceAtFrom: round2dp(openingBalanceAtFrom),
    closingBalance: round2dp(running),
  })
}
