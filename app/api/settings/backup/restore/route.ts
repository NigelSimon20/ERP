import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { previewRestoreCounts, restoreCompanyData } from '@/lib/backup'
import { logAudit } from '@/lib/audit'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden — restore requires Super Admin' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const backup = body as { data?: Record<string, unknown[]> }
  if (!backup || typeof backup.data !== 'object' || backup.data === null) {
    return NextResponse.json({ error: 'Not a recognized backup file — expected a "data" object of table arrays' }, { status: 400 })
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'

  if (dryRun) {
    return NextResponse.json({ dryRun: true, counts: previewRestoreCounts(backup.data) })
  }

  const results = await restoreCompanyData(session.companyId, backup.data)

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'UPDATE',
    module: 'Backup',
    recordId: session.companyId,
    newValues: { action: 'restore', results },
  })

  return NextResponse.json({ results })
}
