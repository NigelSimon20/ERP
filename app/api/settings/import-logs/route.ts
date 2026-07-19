import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const module = req.nextUrl.searchParams.get('module')

  const jobs = await prisma.importJob.findMany({
    where: { companyId: session.companyId, ...(module ? { module } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ jobs })
}
