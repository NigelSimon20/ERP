import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payslip = await prisma.payslip.findFirst({ where: { id: params.id } })
  if (!payslip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Payslip has no companyId column of its own — scope through the guard it belongs to.
  const guard = payslip.employee_id
    ? await prisma.guard.findFirst({
        where: { id: payslip.employee_id, companyId: session.companyId },
        select: { full_name: true, employee_code: true, national_id: true, department: true, employee_type: true },
      })
    : null
  if (!guard) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [lines, run] = await Promise.all([
    prisma.payslipLine.findMany({ where: { payslipId: payslip.id } }),
    payslip.payroll_run_id ? prisma.payrollRun.findFirst({ where: { id: payslip.payroll_run_id, companyId: session.companyId } }) : null,
  ])

  const processedByUser = run
    ? await prisma.user.findUnique({ where: { id: run.processedBy }, select: { name: true } }).catch(() => null)
    : null

  return NextResponse.json({
    payslip: {
      id: payslip.id,
      basicSalary: Number(payslip.basic_salary ?? 0),
      overtimePay: Number(payslip.overtime_pay ?? 0),
      grossPay: Number(payslip.total_earnings ?? 0),
      totalDeductions: Number(payslip.total_deductions ?? 0),
      netPay: Number(payslip.net_pay ?? 0),
      hoursWorked: Number(payslip.hours_worked ?? 0),
      overtimeHours: Number(payslip.overtime_hours ?? 0),
      status: payslip.status,
      lines: lines.map((l) => ({ id: l.id, name: l.itemName, type: l.itemType, amount: Number(l.amount) })),
      guard: {
        name: guard.full_name,
        employeeNumber: guard.employee_code,
        idNumber: guard.national_id,
        department: guard.department,
        rank: guard.employee_type,
      },
      payrollRun: run ? {
        id: run.id,
        reference: null,
        payPeriodStart: run.periodStart.toISOString(),
        payPeriodEnd: run.periodEnd.toISOString(),
        runDate: run.runDate.toISOString(),
        processedBy: processedByUser ? { name: processedByUser.name } : null,
      } : null,
    },
  })
}
