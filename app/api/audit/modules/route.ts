import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

// The Module filter dropdown used to be a hardcoded list of coarse category
// names (Finance, Operations, HR...) that didn't match the real values
// logAudit() writes (SalesInvoices, BankAccount, AUTH vs Auth, CoverageRequest,
// etc. -- one close-to-per-entity string per call site, ~60 distinct values
// and growing). Filtering by "Finance" silently returned zero rows despite
// real Finance-module entries existing. Populating the dropdown from the
// actual distinct values in the table, instead of a curated list that will
// always drift, means the filter can never reference a module that doesn't
// exist in the data.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await prisma.auditTrail.findMany({
    where: { companyId: session.companyId },
    select: { module: true },
    distinct: ['module'],
    orderBy: { module: 'asc' },
  })

  return NextResponse.json({ modules: rows.map((r) => r.module).filter(Boolean).sort((a, b) => a.localeCompare(b)) })
}
