import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { commitImportJob } from '@/lib/import-export/commit'
import { apiError } from '@/lib/api-error'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId, excludeRowIds } = await req.json()
  if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

  const job = await prisma.importJob.findFirst({ where: { id: jobId, companyId: session.companyId, module: 'employees' } })
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })

  try {
    const result = await commitImportJob(jobId, Array.isArray(excludeRowIds) ? excludeRowIds : [])
    return NextResponse.json(result)
  } catch (err) {
    return apiError(err, 'Commit failed', 400)
  }
}
