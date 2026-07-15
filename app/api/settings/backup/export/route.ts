import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { exportCompanyData } from '@/lib/backup'
import { logAudit } from '@/lib/audit'

// Exporting every table can take a while for a data-heavy company; give it
// more room than Next's default route timeout (capped automatically by
// Vercel to whatever the deployed plan actually allows).
export const maxDuration = 300

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const backup = await exportCompanyData(session.companyId)

  await logAudit({
    companyId: session.companyId,
    userId: session.userId,
    userName: session.name,
    action: 'CREATE',
    module: 'Backup',
    recordId: session.companyId,
    newValues: { action: 'export', tables: Object.keys(backup.data).length },
  })

  const filename = `ravenshield-backup-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
