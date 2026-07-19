import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const job = await prisma.importJob.findFirst({
    where: { id: params.jobId, companyId: session.companyId },
    include: { rows: { orderBy: { rowNumber: 'asc' } } },
  })
  if (!job) return NextResponse.json({ error: 'Import job not found' }, { status: 404 })

  return NextResponse.json({ job })
}
