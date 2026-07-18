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

  // Payslip has no companyId column of its own — scope through the guard it
  // belongs to, which does.
  const companyGuardIds = (await prisma.guard.findMany({ where: { companyId }, select: { id: true } })).map((g) => g.id)

  const payslips = await prisma.payslip.findMany({
    where: {
      AND: [
        { employee_id: { in: companyGuardIds } },
        ...(payrollRunId ? [{ payroll_run_id: payrollRunId }] : []),
        ...(guardId ? [{ employee_id: guardId }] : []),
      ],
    },
    orderBy: { created_date: 'desc' },
  })

  const [guards, runs] = await Promise.all([
    prisma.guard.findMany({ where: { id: { in: payslips.map((p) => p.employee_id).filter((v): v is string => !!v) } }, select: { id: true, full_name: true, employee_code: true } }),
    prisma.payrollRun.findMany({ where: { id: { in: payslips.map((p) => p.payroll_run_id).filter((v): v is string => !!v) } }, select: { id: true, periodStart: true, periodEnd: true, runDate: true } }),
  ])
  const guardById = new Map(guards.map((g) => [g.id, g]))
  const runById = new Map(runs.map((r) => [r.id, r]))

  const mapped = payslips.map((p) => {
    const guard = p.employee_id ? guardById.get(p.employee_id) : undefined
    const run = p.payroll_run_id ? runById.get(p.payroll_run_id) : undefined
    return {
      id: p.id,
      basicSalary: Number(p.basic_salary ?? 0),
      overtimePay: Number(p.overtime_pay ?? 0),
      grossPay: Number(p.total_earnings ?? 0),
      totalDeductions: Number(p.total_deductions ?? 0),
      netPay: Number(p.net_pay ?? 0),
      hoursWorked: Number(p.hours_worked ?? 0),
      overtimeHours: Number(p.overtime_hours ?? 0),
      status: p.status,
      guard: guard ? { name: guard.full_name, employeeNumber: guard.employee_code } : null,
      payrollRun: run ? { id: run.id, payPeriodStart: run.periodStart.toISOString(), payPeriodEnd: run.periodEnd.toISOString(), runDate: run.runDate.toISOString() } : null,
    }
  })

  return NextResponse.json({ payslips: mapped })
}
