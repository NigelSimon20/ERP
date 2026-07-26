import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextPaymentReference, nextReceiptReference } from '@/lib/auto-numbers'
import { applyBalanceDeltas } from '@/lib/gl-posting'
import { round2dp } from '@/lib/calculations'
import crypto from 'crypto'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyAccounts = await prisma.bankAccount.findMany({ where: { companyId: session.companyId }, select: { id: true } })
  const recs = await prisma.bankReconciliation.findMany({
    where: { bankAccountId: { in: companyAccounts.map((a) => a.id) } },
    orderBy: { reconcileDate: 'desc' },
  })

  return NextResponse.json({
    reconciliations: recs.map((r) => ({
      ...r,
      statementBalance: Number(r.statementBalance),
      bookBalance: Number(r.bookBalance),
      difference: Number(r.difference),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'close') {
    const body = await req.json()
    const { id } = body
    const rec = await prisma.bankReconciliation.findFirst({ where: { id } })
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const owningAccount = await prisma.bankAccount.findFirst({ where: { id: rec.bankAccountId, companyId: session.companyId } })
    if (!owningAccount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (Math.abs(Number(rec.difference)) > 0.01) {
      return NextResponse.json({ error: `Cannot close: outstanding difference of ${Number(rec.difference).toFixed(2)}` }, { status: 400 })
    }
    const updated = await prisma.bankReconciliation.update({ where: { id }, data: { status: 'RECONCILED' } })
    return NextResponse.json({ reconciliation: { ...updated, difference: Number(updated.difference), statementBalance: Number(updated.statementBalance), bookBalance: Number(updated.bookBalance) } })
  }

  // Posts a one-time correcting entry for the confirmed difference between
  // the statement balance and the live book balance, then closes the
  // reconciliation. The register (Payment ∪ BankTransfer replay) and
  // current_balance only ever drift apart from incomplete legacy data, never
  // from a bug in how balances are posted going forward — so rather than
  // guessing which side is "right", this records an explicit, auditable
  // adjustment against a real chart-of-account (Suspense by default, or
  // whichever account the user picks) instead of silently overwriting either
  // number.
  if (action === 'adjust') {
    const body = await req.json()
    const { id, offsetAccountId } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const rec = await prisma.bankReconciliation.findFirst({ where: { id } })
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (rec.status === 'RECONCILED') return NextResponse.json({ error: 'Already reconciled' }, { status: 400 })

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: rec.bankAccountId, companyId: session.companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Recompute live rather than trusting the bookBalance captured when the
    // reconciliation was started — other transactions may have posted since.
    const liveBookBalance = Number(bankAccount.current_balance ?? 0)
    const statementBalance = Number(rec.statementBalance)
    const difference = round2dp(statementBalance - liveBookBalance)

    if (Math.abs(difference) <= 0.01) {
      const closed = await prisma.bankReconciliation.update({
        where: { id },
        data: { status: 'RECONCILED', bookBalance: liveBookBalance, difference: 0 },
      })
      return NextResponse.json({ reconciliation: { ...closed, difference: 0, statementBalance: Number(closed.statementBalance), bookBalance: Number(closed.bookBalance) }, adjustment: null })
    }

    let offsetAccount = offsetAccountId
      ? await prisma.chartOfAccount.findFirst({ where: { id: offsetAccountId, companyId: session.companyId } })
      : await prisma.chartOfAccount.findFirst({ where: { companyId: session.companyId, account_type: 'SUSPENSE' } })
    if (!offsetAccount) {
      return NextResponse.json({ error: 'No offset account found — choose one, or create a Suspense account in Chart of Accounts first' }, { status: 400 })
    }

    const isIncrease = difference > 0
    const amount = Math.abs(difference)
    const reference = isIncrease ? await nextReceiptReference(session.companyId) : await nextPaymentReference(session.companyId)
    const description = `Bank reconciliation adjustment — statement ${statementBalance.toFixed(2)} vs book ${liveBookBalance.toFixed(2)} as of ${rec.reconcileDate.toISOString().split('T')[0]}`

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bank_account_id: bankAccount.id,
          bank_account_name: bankAccount.bank_name ?? '',
          payment_number: reference,
          // Increases reuse 'Customer Receipt' so they count as an inflow
          // everywhere that already treats that type specially (dashboards,
          // the register, cash-flow reports) — customer_id stays null so it
          // never appears on any customer's statement or portal. Decreases
          // need no special type: every payment_type other than 'Customer
          // Receipt' is already treated as an outflow by convention.
          payment_type: isIncrease ? 'Customer Receipt' : 'Reconciliation Adjustment',
          party_name: 'Bank Reconciliation Adjustment',
          amount,
          payment_date: rec.reconcileDate.toISOString().split('T')[0],
          payment_method: 'Other',
          customer_id: null,
          currency: bankAccount.currency ?? 'USD',
          description,
          allocations: '[]',
          status: 'Posted',
          created_by_id: session.userId,
          created_by: session.name,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
      })

      await tx.bankAccount.update({ where: { id: bankAccount.id }, data: { current_balance: { increment: difference } } })

      const bankLedger = await tx.bankAccount.findUnique({ where: { id: bankAccount.id }, select: { chart_account_id: true } }).catch(() => null)
      let journalEntryId: string | null = null
      if (bankLedger?.chart_account_id) {
        const bankGLId = bankLedger.chart_account_id
        const je = await tx.journalEntry.create({
          data: {
            id: crypto.randomUUID(),
            companyId: session.companyId,
            reference: `JE-auto-${reference}`,
            entry_date: rec.reconcileDate.toISOString(),
            description,
            total_debit: amount,
            total_credit: amount,
            status: 'POSTED',
            created_by_id: session.userId,
          },
        })
        const lines = isIncrease
          ? [
              { accountId: bankGLId, debit: amount, credit: 0, description },
              { accountId: offsetAccount!.id, debit: 0, credit: amount, description },
            ]
          : [
              { accountId: offsetAccount!.id, debit: amount, credit: 0, description },
              { accountId: bankGLId, debit: 0, credit: amount, description },
            ]
        await tx.journalLine.createMany({ data: lines.map((l) => ({ id: crypto.randomUUID(), journalEntryId: je.id, ...l })) })
        await applyBalanceDeltas(tx, lines)
        await tx.payment.update({ where: { id: payment.id }, data: { journal_entry_id: je.id } })
        journalEntryId = je.id
      }

      const updatedRec = await tx.bankReconciliation.update({
        where: { id },
        data: { status: 'RECONCILED', bookBalance: statementBalance, difference: 0 },
      })

      return { payment, journalEntryId, updatedRec }
    }, { timeout: 30000 })

    await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'UPDATE', module: 'BankReconciliation', recordId: id })

    return NextResponse.json({
      reconciliation: { ...result.updatedRec, difference: 0, statementBalance: Number(result.updatedRec.statementBalance), bookBalance: Number(result.updatedRec.bookBalance) },
      adjustment: { paymentId: result.payment.id, paymentNumber: result.payment.payment_number, amount, direction: isIncrease ? 'increase' : 'decrease', journalEntryId: result.journalEntryId, offsetAccountName: offsetAccount!.account_name },
    })
  }

  // Create reconciliation
  const body = await req.json()
  const { bankAccountId, reconcileDate, statementBalance } = body
  const { companyId } = session

  if (!bankAccountId || !reconcileDate || statementBalance === undefined) {
    return NextResponse.json({ error: 'bankAccountId, reconcileDate, statementBalance required' }, { status: 400 })
  }

  const bankAccount = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
  if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

  const bookBalance = Number(bankAccount.current_balance)
  const stmtBalance = Number(statementBalance)
  const difference = stmtBalance - bookBalance

  const rec = await prisma.bankReconciliation.create({
    data: {
      id: crypto.randomUUID(),
      bankAccountId,
      reconcileDate: new Date(reconcileDate),
      statementBalance: stmtBalance,
      bookBalance,
      difference,
      status: 'OPEN',
    },
  })
  await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'BankReconciliation', recordId: rec.id })
  return NextResponse.json({ reconciliation: { ...rec, statementBalance: Number(rec.statementBalance), bookBalance: Number(rec.bookBalance), difference: Number(rec.difference) } }, { status: 201 })
}
