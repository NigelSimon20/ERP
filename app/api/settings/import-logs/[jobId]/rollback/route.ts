import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { rollbackImportJob } from '@/lib/import-export/rollback'

export const maxDuration = 300

// Shared, module-agnostic rollback endpoint for the cross-module Import Logs
// viewer -- rollbackImportJob() already looks up the right ModuleImportConfig
// from job.module internally, so this route doesn't need per-module copies
// the way parse/validate/commit do (those need a module-specific field list
// before a job even exists).
export async function POST(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const job = await prisma.importJob.findFirst({ where: { id: params.jobId, companyId: session.companyId } })
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })

  try {
    const result = await rollbackImportJob(params.jobId, { userId: session.userId, userName: session.name })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Rollback failed' }, { status: 400 })
  }
}
