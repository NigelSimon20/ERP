import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ledgerBalances } from '@/lib/reports/ledger'
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

  // A4: the calculated balance is the bank's GL account in the ledger (every
  // posted receipt, payment, transfer and payroll payment), plus its opening
  // balance only if that hasn't been posted as an opening-balance journal yet.
  // It used to add up receipts and payments alone, so transfers and payroll
  // showed as a variance even when the books agreed.
  const glIds = accounts.map((a) => a.chart_account_id).filter((v): v is string => !!v)
  const [ledger, openingJournals] = await Promise.all([
    ledgerBalances(prisma, session.companyId, {}),
    glIds.length
      ? prisma.journalEntry.findMany({ where: { companyId: session.companyId, source_type: 'openingBalance', source_id: { in: glIds }, status: 'POSTED' }, select: { source_id: true } })
      : [],
  ])
  const glBalance = new Map(ledger.map((r) => [r.id, r.balance]))
  const openingPosted = new Set(openingJournals.map((j) => j.source_id))
  const calculated = (a: (typeof accounts)[number]) => {
    const opening = new Prisma.Decimal(a.opening_balance ?? 0)
    if (!a.chart_account_id) return Number(opening)
    const gl = glBalance.get(a.chart_account_id) ?? new Prisma.Decimal(0)
    return Number(openingPosted.has(a.chart_account_id) ? gl : gl.add(opening))
  }

  const result = accounts.map((a) => ({
    ...a,
    bankName: a.bank_name,
    accountNumber: a.account_number,
    accountType: a.account_type,
    openingBalance: Number(a.opening_balance),
    currentBalance: Number(a.current_balance),
    calculatedBalance: calculated(a),
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
