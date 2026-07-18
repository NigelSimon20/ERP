import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const run = await prisma.payrollRun.findFirst({
    where: { id: params.id, companyId: session.companyId },
  })

  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const processedByUser = await prisma.user.findUnique({ where: { id: run.processedBy }, select: { name: true } }).catch(() => null)
  const bankAccount = run.bankAccountId
    ? await prisma.bankAccount.findUnique({ where: { id: run.bankAccountId }, select: { id: true, bank_name: true, account_name: true } }).catch(() => null)
    : null
  const payslips = await prisma.payslip.findMany({
    where: { payroll_run_id: params.id },
  })

  return NextResponse.json({ run: { ...run, processedByUser, bankAccount, payslips } })
}
