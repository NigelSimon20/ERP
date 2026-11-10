import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'
import { postOpeningBalance } from '@/lib/opening-balances'

const createSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountType: z.string().min(1),
  currency: z.string().length(3).default('USD'),
  openingBalance: z.coerce.number().default(0),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accounts = await prisma.bankAccount.findMany({
    where: { companyId: session.companyId },
    orderBy: { bank_name: 'asc' },
  })

  const ids = accounts.map((a) => a.id)

  const [receiptAggs, paymentAggs] = await Promise.all([
    prisma.payment.groupBy({
      by: ['bank_account_id'],
      where: { bank_account_id: { in: ids }, companyId: session.companyId, payment_type: 'Customer Receipt' },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['bank_account_id'],
      where: { bank_account_id: { in: ids }, payment_type: { not: 'Customer Receipt' } },
      _sum: { amount: true },
    }),
  ])

  const receiptMap = Object.fromEntries(
    receiptAggs.map((r) => [r.bank_account_id, Number(r._sum.amount ?? 0)]),
  )
  const paymentMap = Object.fromEntries(
    paymentAggs.map((p) => [p.bank_account_id, Number(p._sum.amount ?? 0)]),
  )

  const result = accounts.map((a) => ({
    ...a,
    bankName: a.bank_name,
    accountNumber: a.account_number,
    accountType: a.account_type,
    openingBalance: Number(a.opening_balance),
    currentBalance: Number(a.current_balance),
    calculatedBalance:
      Number(a.opening_balance) + (receiptMap[a.id] ?? 0) - (paymentMap[a.id] ?? 0),
  }))

  return NextResponse.json({ accounts: result })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = createSchema.parse(await req.json())

    const result = await prisma.$transaction(async (tx) => {
      // Find highest bank-series account code (1010–1099) to auto-increment
      const existingBankAccounts = await tx.chartOfAccount.findMany({
        where: {
          companyId: session.companyId,
          is_bank_account: true,
          account_code: { startsWith: '101' },
        },
        select: { account_code: true },
        orderBy: { account_code: 'desc' },
        take: 1,
      })

      const lastCode = existingBankAccounts[0]?.account_code
      const nextCode = lastCode ? String(Number(lastCode) + 1) : '1013'

      const coaId = crypto.randomUUID()
      const now = new Date().toISOString()

      // Create corresponding Chart of Account entry
      await tx.chartOfAccount.create({
        data: {
          id: coaId,
          companyId: session.companyId,
          account_code: nextCode,
          account_name: `Bank - ${data.bankName} (${data.accountNumber})`,
          account_type: 'ASSET',
          account_subtype: 'Current Asset',
          is_bank_account: true,
          is_active: true,
          opening_balance: data.openingBalance,
          // Moves only through journals: the opening balance below.
          current_balance: 0,
          currency: data.currency,
          created_date: now,
          updated_date: now,
        },
      })

      // Create bank account linked to the new COA entry
      const account = await tx.bankAccount.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          bank_name: data.bankName,
          account_number: data.accountNumber,
          account_type: data.accountType,
          currency: data.currency,
          opening_balance: data.openingBalance,
          current_balance: data.openingBalance,
          chart_account_id: coaId,
          is_active: true,
          created_date: now,
          updated_date: now,
        },
      })

      await postOpeningBalance(tx, {
        companyId: session.companyId, accountId: coaId, amount: data.openingBalance,
        entryDate: now, userId: session.userId, label: nextCode,
      })

      return { account, ledgerCode: nextCode }
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'BankAccounts',
      recordId: result.account.id,
      newValues: { bankName: data.bankName, accountNumber: data.accountNumber, ledgerCode: result.ledgerCode },
    })

    return NextResponse.json({ account: result.account }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
