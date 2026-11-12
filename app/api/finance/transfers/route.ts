import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextTransferReference } from '@/lib/auto-numbers'
import { calculateTransferImpact, calculateNewBankBalance } from '@/lib/calculations'
import { checkLockDate } from '@/lib/lock-dates'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'

const transferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  transferDate: z.string(),
  notes: z.string().optional(),
})

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyAccounts = await prisma.bankAccount.findMany({ where: { companyId: session.companyId }, select: { id: true, bank_name: true, account_number: true } })
  const accountIds = companyAccounts.map((a) => a.id)
  const accountMap = Object.fromEntries(companyAccounts.map((a) => [a.id, { bankName: a.bank_name, accountNumber: a.account_number }]))

  const transfers = await prisma.bankTransfer.findMany({
    where: { OR: [{ fromAccountId: { in: accountIds } }, { toAccountId: { in: accountIds } }] },
    orderBy: { transferDate: 'desc' },
  })

  const result = transfers.map((t) => ({
    ...t,
    fromAccount: accountMap[t.fromAccountId] ?? null,
    toAccount: accountMap[t.toAccountId] ?? null,
  }))

  return NextResponse.json({ transfers: result })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = transferSchema.parse(await req.json())

    if (data.fromAccountId === data.toAccountId) {
      return NextResponse.json({ error: 'Source and destination accounts must differ' }, { status: 400 })
    }

    const lockError = await checkLockDate(session.companyId, new Date(data.transferDate))
    if (lockError) return NextResponse.json({ error: lockError, code: 'PERIOD_LOCKED' }, { status: 422 })

    const [fromAccount, toAccount] = await Promise.all([
      prisma.bankAccount.findFirst({ where: { id: data.fromAccountId, companyId: session.companyId } }),
      prisma.bankAccount.findFirst({ where: { id: data.toAccountId, companyId: session.companyId } }),
    ])

    if (!fromAccount || !toAccount) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })
    }

    const fromBalance = Number(fromAccount.current_balance ?? 0)
    const toBalance = Number(toAccount.current_balance ?? 0)
    const transferImpact = calculateTransferImpact(fromBalance, toBalance, data.amount)
    if (!transferImpact.valid) {
      return NextResponse.json({ error: transferImpact.reason }, { status: 400 })
    }

    const reference = await nextTransferReference(session.companyId)

    const transfer = await prisma.$transaction(async (tx) => {
      // Atomic, guarded decrement/increment — Postgres evaluates the WHERE
      // against the live row in the same statement, so this is safe under
      // concurrent transfers touching either account (no lost update, no
      // TOCTOU overdraft) unlike writing the pre-computed absolute balances.
      const decremented = await tx.bankAccount.updateMany({
        where: { id: data.fromAccountId, current_balance: { gte: data.amount } },
        data: { current_balance: { decrement: data.amount } },
      })
      if (decremented.count === 0) throw new Error('Insufficient balance in source account')
      await tx.bankAccount.update({
        where: { id: data.toAccountId },
        data: { current_balance: { increment: data.amount } },
      })
      const [updatedFromAccount, updatedToAccount] = await Promise.all([
        tx.bankAccount.findUniqueOrThrow({ where: { id: data.fromAccountId } }),
        tx.bankAccount.findUniqueOrThrow({ where: { id: data.toAccountId } }),
      ])

      const t = await tx.bankTransfer.create({
        data: {
          id: crypto.randomUUID(),
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
          amount: data.amount,
          reference,
          transferDate: new Date(data.transferDate),
          notes: data.notes ?? '',
          createdBy: session.userId,
        },
      })

      const [fromLedger, toLedger] = await Promise.all([
        tx.bankAccount.findUnique({ where: { id: data.fromAccountId }, select: { chart_account_id: true } }).catch(() => null),
        tx.bankAccount.findUnique({ where: { id: data.toAccountId }, select: { chart_account_id: true } }).catch(() => null),
      ])

      const fromLedgerId = fromLedger?.chart_account_id
      const toLedgerId = toLedger?.chart_account_id

      if (fromLedgerId && toLedgerId) {
        const je = await tx.journalEntry.create({
          data: {
            id: crypto.randomUUID(),
            companyId: session.companyId,
            reference: `JE-auto-${reference}`,
            entry_date: new Date(data.transferDate).toISOString(),
            description: `Bank transfer`,
            total_debit: data.amount,
            total_credit: data.amount,
            status: 'POSTED',
            created_by_id: session.userId,
          },
        })
        await tx.journalLine.createMany({
          data: [
            {
              id: crypto.randomUUID(),
              journalEntryId: je.id,
              accountId: toLedgerId,
              description: 'Transfer in',
              debit: data.amount,
              credit: 0,
            },
            {
              id: crypto.randomUUID(),
              journalEntryId: je.id,
              accountId: fromLedgerId,
              description: 'Transfer out',
              debit: 0,
              credit: data.amount,
            },
          ],
        })

        await tx.chartOfAccount.update({ where: { id: toLedgerId }, data: { current_balance: { increment: data.amount } } })
        await tx.chartOfAccount.update({ where: { id: fromLedgerId }, data: { current_balance: { decrement: data.amount } } })
      }

      return { transfer: t, updatedFromAccount, updatedToAccount }
    }, { timeout: 60000 })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'BankTransfers',
      recordId: transfer.transfer.id,
      newValues: {
        reference,
        amount: data.amount,
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        newFromBalance: transfer.updatedFromAccount.current_balance,
        newToBalance: transfer.updatedToAccount.current_balance,
      },
    })

    return NextResponse.json({
      transfer: transfer.transfer,
      updatedFromAccount: transfer.updatedFromAccount,
      updatedToAccount: transfer.updatedToAccount,
    }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
