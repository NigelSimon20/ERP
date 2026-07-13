import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const NORMAL_DEBIT = ['ASSET', 'EXPENSE']

function balanceDelta(accountType: string, debit: number, credit: number, reverse = false) {
  const normalDebit = NORMAL_DEBIT.includes(accountType)
  const delta = normalDebit ? debit - credit : credit - debit
  return reverse ? -delta : delta
}

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
  const accountIds = Array.from(new Set(lines.map((line) => line.accountId).filter(Boolean)))
  const accounts = await prisma.chartOfAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, account_type: true },
  })
  const accountMap = Object.fromEntries(accounts.map((account) => [account.id, account]))

  if (action === 'post') {
    if (entry.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only DRAFT entries can be posted' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.update({
        where: { id: params.id },
        data: { status: 'POSTED', updated_date: new Date().toISOString() },
      })

      for (const line of lines) {
        const account = accountMap[line.accountId]
        const delta = balanceDelta(
          account?.account_type ?? 'ASSET',
          Number(line.debit),
          Number(line.credit),
        )
        await tx.chartOfAccount.update({
          where: { id: line.accountId },
          data: { current_balance: { increment: delta } },
        })
      }
    })

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

    const wasPosted = entry.status === 'POSTED'

    await prisma.$transaction(async (tx) => {
      await tx.journalEntry.update({
        where: { id: params.id },
        data: { status: 'VOID', updated_date: new Date().toISOString() },
      })

      if (wasPosted) {
        for (const line of lines) {
          const account = accountMap[line.accountId]
          const delta = balanceDelta(
            account?.account_type ?? 'ASSET',
            Number(line.debit),
            Number(line.credit),
            true,
          )
          await tx.chartOfAccount.update({
            where: { id: line.accountId },
            data: { current_balance: { increment: delta } },
          })
        }
      }
    })

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
