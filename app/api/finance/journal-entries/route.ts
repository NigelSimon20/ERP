import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate, pageLimit } from '@/lib/utils'
import { nextJournalReference } from '@/lib/auto-numbers'
import { toJournalEntryDto } from '@/lib/journal-entries'
import { normaliseJournalLines, assertAccountsUsable, journalEntryCreateSchema } from '@/lib/journal-rules'
import { sumMoney } from '@/lib/money'
import { apiError } from '@/lib/api-error'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const reference = searchParams.get('reference') || undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Number(searchParams.get('page') ?? '1')

  const where = {
    companyId: session.companyId,
    ...(status && { status }),
    ...(reference && { reference: { contains: reference } }),
    ...(from || to
      ? {
          entry_date: {
            ...(from && { gte: new Date(from).toISOString() }),
            ...(to && { lte: new Date(to).toISOString() }),
          },
        }
      : {}),
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    orderBy: [{ entry_date: 'desc' }, { id: 'asc' }],
    ...paginate(page, pageLimit(searchParams)),
  })
  const total = await prisma.journalEntry.count({ where })
  const entryIds = entries.map((entry) => entry.id)
  const lineSums = entryIds.length
    ? await prisma.journalLine.groupBy({
        by: ['journalEntryId'],
        where: { journalEntryId: { in: entryIds } },
        _sum: { debit: true, credit: true },
      })
    : []
  const lineSumMap = Object.fromEntries(
    lineSums.map((sum) => [sum.journalEntryId, sum]),
  )

  // Stable DTO: the page reads camelCase `date`, but the column is the
  // imported snake_case `entry_date`. Spreading the raw row let that drift
  // reach the client and crash the page on `new Date(undefined)`.
  const enriched = entries.map((e) => toJournalEntryDto(e, lineSumMap[e.id]?._sum))

  return NextResponse.json({ entries: enriched, total, page })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = journalEntryCreateSchema.parse(await req.json())

    // Balance, line shape and totals were checked by the schema; amounts are
    // rounded to 2 dp here and every account must be usable by this company.
    const lines = normaliseJournalLines(data.lines)
    await assertAccountsUsable(prisma, session.companyId, lines.map((l) => l.accountId))
    const totalDebit = sumMoney(lines.map((l) => l.debit))

    const entryDate = new Date(data.entryDate as string)
    const lockDate = await prisma.lockDate.findFirst({
      where: { companyId: session.companyId, lockedUntil: { gte: entryDate } },
    })
    if (lockDate) {
      return NextResponse.json(
        { error: `Period is locked until ${lockDate.lockedUntil.toLocaleDateString()}`, code: 'PERIOD_LOCKED' },
        { status: 422 },
      )
    }

    const reference = await nextJournalReference(session.companyId)

    const entry = await prisma.$transaction(async (tx) => {
      const je = await tx.journalEntry.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          reference,
          entry_date: entryDate.toISOString(),
          description: data.description,
          status: 'DRAFT',
          // Maker-checker compares this with whoever posts it (P1-9).
          created_by_id: session.userId,
          created_by: session.name,
          created_date: new Date().toISOString(),
        },
      })

      await tx.journalLine.createMany({
        data: lines.map((line) => ({ id: crypto.randomUUID(), journalEntryId: je.id, ...line })),
      })

      return je
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'JournalEntries',
      recordId: entry.id,
      newValues: { reference, description: data.description, totalDebit },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}
