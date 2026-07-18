import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || undefined
  const module = searchParams.get('module') || undefined
  const action = searchParams.get('action') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))

  const where = {
    companyId: session.companyId,
    ...(userId && { userId }),
    ...(module && { module }),
    ...(action && { action }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(`${dateTo}T23:59:59.999Z`) }),
      },
    }),
  }

  const [logs, total] = await Promise.all([
    prisma.auditTrail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditTrail.count({ where }),
  ])

  const parsedLogs = logs.map((log) => ({
    ...log,
    oldValues: log.oldValues ? safeJsonParse(log.oldValues) : null,
    newValues: log.newValues ? safeJsonParse(log.newValues) : null,
  }))

  return NextResponse.json({ logs: parsedLogs, total, page, pageSize: PAGE_SIZE })
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
