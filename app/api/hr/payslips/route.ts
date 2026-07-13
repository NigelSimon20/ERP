import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const payrollRunId = searchParams.get('payrollRunId')
  const guardId = searchParams.get('guardId')

  const payslips = await prisma.payslip.findMany({
    where: {
      ...(payrollRunId ? { journal_entry_id: payrollRunId } : {}),
      ...(guardId ? { employee_id: guardId } : {}),
    },
    orderBy: { created_date: 'desc' },
  })

  return NextResponse.json({ payslips })
}
