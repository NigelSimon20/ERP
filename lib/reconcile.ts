import { Prisma, PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { ledgerBalances } from './reports/ledger'
import { getReceivables, getPayables } from './reports/subledger'

type Db = PrismaClient | Prisma.TransactionClient
const D = Prisma.Decimal

export interface ReconcileDifference {
  kind: 'GL_ACCOUNT' | 'BANK_ACCOUNT' | 'RECEIVABLES' | 'PAYABLES'
  id: string | null
  label: string
  stored: number
  expected: number
  difference: number
}

// P1-3 (BUG-010/005): stored balances must equal what the ledger says.
//  - each GL account's current_balance vs the sum of its posted lines
//  - each bank account's current_balance vs its linked GL account
//  - AR / AP subledgers vs their control accounts
// Reports only; scripts/remediate/recompute-balances.mjs fixes, once approved.
export async function reconcileCompany(db: Db, companyId: string): Promise<{ companyId: string; differences: ReconcileDifference[]; clean: boolean }> {
  const differences: ReconcileDifference[] = []
  const [ledger, stored, banks] = await Promise.all([
    ledgerBalances(db, companyId, {}),
    db.chartOfAccount.findMany({ where: { companyId }, select: { id: true, current_balance: true } }),
    db.bankAccount.findMany({ where: { companyId, is_active: true }, select: { id: true, account_name: true, bank_name: true, current_balance: true, chart_account_id: true } }),
  ])
  const storedById = new Map(stored.map((a) => [a.id, new D(a.current_balance ?? 0)]))
  const ledgerById = new Map(ledger.map((a) => [a.id, a]))

  for (const a of ledger) {
    const s = storedById.get(a.id) ?? new D(0)
    if (!s.eq(a.balance)) {
      differences.push({ kind: 'GL_ACCOUNT', id: a.id, label: `${a.code ?? ''} ${a.name ?? ''}`.trim(), stored: Number(s), expected: Number(a.balance), difference: Number(s.sub(a.balance)) })
    }
  }
  for (const b of banks) {
    if (!b.chart_account_id) continue
    const gl = ledgerById.get(b.chart_account_id)?.balance ?? new D(0)
    const s = new D(b.current_balance ?? 0)
    if (!s.eq(gl)) {
      differences.push({ kind: 'BANK_ACCOUNT', id: b.id, label: b.account_name || b.bank_name || b.id, stored: Number(s), expected: Number(gl), difference: Number(s.sub(gl)) })
    }
  }
  const [ar, ap] = await Promise.all([getReceivables(db, companyId), getPayables(db, companyId)])
  for (const [kind, sub, label] of [['RECEIVABLES', ar, 'Receivables subledger vs AR control'], ['PAYABLES', ap, 'Payables subledger vs AP control']] as const) {
    if (sub.difference && !sub.difference.isZero()) {
      differences.push({ kind, id: sub.controlAccountId, label, stored: Number(sub.total), expected: Number(sub.controlAccountBalance), difference: Number(sub.difference) })
    }
  }
  return { companyId, differences, clean: differences.length === 0 }
}

// Notifies the company's admins when the books don't reconcile.
export async function notifyReconcileDifferences(db: Db, result: Awaited<ReturnType<typeof reconcileCompany>>) {
  if (result.clean) return 0
  const admins = await db.user.findMany({ where: { companyId: result.companyId, active: true, role: { in: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'] } }, select: { id: true } })
  const top = result.differences.slice(0, 5).map((d) => `${d.label}: ${d.difference.toFixed(2)}`).join('; ')
  await db.notification.createMany({
    data: admins.map((u) => ({
      id: crypto.randomUUID(), userId: u.id, companyId: result.companyId, type: 'RECONCILE',
      title: `Books out of balance: ${result.differences.length} difference(s)`,
      message: top, link: '/finance/finance-reports',
    })),
  })
  return admins.length
}
