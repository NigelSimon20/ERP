import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGuardSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getGuardSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.guardId) return NextResponse.json({ payslips: [] })

  const payslips = await prisma.payslip.findMany({
    // Orphan payslips (no payroll run) are quarantined (P1-10).
    where: { employee_id: session.guardId, payroll_run_id: { not: null } },
    orderBy: { pay_date: 'desc' },
    take: 24,
    select: {
      id: true,
      payroll_run_id: true,
      total_earnings: true,
      total_deductions: true,
      net_pay: true,
      hours_worked: true,
      status: true,
    },
  })

  // Payslip has no formal relation to PayrollRun (only a payroll_run_id
  // scalar) — same pattern already used in app/api/dashboard/guard/route.ts.
  const runIds = Array.from(new Set(payslips.map(p => p.payroll_run_id).filter(Boolean) as string[]))
  const runs = runIds.length
    ? await prisma.payrollRun.findMany({ where: { id: { in: runIds } }, select: { id: true, periodStart: true, periodEnd: true } })
    : []
  const runMap = Object.fromEntries(runs.map(r => [r.id, r]))

  return NextResponse.json({
    payslips: payslips.map(p => {
      const run = p.payroll_run_id ? runMap[p.payroll_run_id] : undefined
      return {
        id: p.id,
        payrollRunId: p.payroll_run_id ?? '',
        grossPay: Number(p.total_earnings ?? 0),
        totalDeductions: Number(p.total_deductions ?? 0),
        netPay: Number(p.net_pay ?? 0),
        hoursWorked: Number(p.hours_worked ?? 0),
        status: p.status ?? 'PENDING',
        payrollRun: run ? { periodStart: run.periodStart.toISOString(), periodEnd: run.periodEnd.toISOString() } : undefined,
      }
    }),
  })
}
