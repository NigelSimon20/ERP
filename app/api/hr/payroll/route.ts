import { NextRequest, NextResponse } from 'next/server'
import { idempotentPost } from '@/lib/idempotency'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextJournalReference } from '@/lib/auto-numbers'
import { calculatePayslipItem } from '@/lib/calculations'
import { computePay, resolvePayBasis, payrollRunProblems, PAID_DAY_STATUSES } from '@/lib/payroll/engine'
import { loadStatutoryTables } from '@/lib/payroll/statutory'
import { checkLockDate } from '@/lib/lock-dates'
import { hoursForStatus } from '@/lib/attendance-hours'

function r2(n: number) { return Math.round(n * 100) / 100 }

// Shared by preview and confirm so a payroll run is always paid out exactly
// what preview showed — confirm previously trusted client-submitted amounts
// wholesale, letting a tampered/inflated request body pay out more than
// earned and post it as a legitimate, balanced GL entry with no cross-check.
async function computePayrollPreviews(companyId: string, start: Date, end: Date) {
  const [guards, payslipItems, company] = await Promise.all([
    prisma.guard.findMany({ where: { companyId, status: 'Active' } }),
    prisma.payslipItem.findMany({ where: { companyId, active: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { standardHoursPerMonth: true, defaultPayBasis: true, currency: true } }),
  ])
  const standardHoursPerMonth = company?.standardHoursPerMonth ?? 160
  // Overtime on daily pay needs an hourly rate: the standard month spread
  // over 26 working days.
  const hoursPerDay = standardHoursPerMonth / 26
  const tables = await loadStatutoryTables(prisma, companyId, end, company?.currency || 'USD')

  const earningItems = payslipItems.filter((i) => i.itemType === 'EARNING')
  const deductionItems = payslipItems.filter((i) => i.itemType === 'DEDUCTION')

  // One query for every guard's attendance instead of one per guard (the
  // pooler drops connections under hundreds of parallel queries).
  const attendanceRows = await prisma.attendance.findMany({
    where: { guardId: { in: guards.map((g) => g.id) }, date: { gte: start, lte: end } },
    select: { guardId: true, hoursWorked: true, overtimeHours: true, status: true },
  })
  const byGuard = new Map<string, { paidDays: number; hours: number; overtime: number }>()
  for (const row of attendanceRows) {
    const t = byGuard.get(row.guardId) ?? { paidDays: 0, hours: 0, overtime: 0 }
    if ((PAID_DAY_STATUSES as readonly string[]).includes(row.status)) t.paidDays++
    // Legacy rows never had hoursWorked stamped; derive it from the status
    // the same way the attendance API does.
    const stored = Number(row.hoursWorked)
    t.hours += stored > 0 ? stored : hoursForStatus(row.status)
    t.overtime += Number(row.overtimeHours)
    byGuard.set(row.guardId, t)
  }

  return guards.map((guard) => {
    const att = byGuard.get(guard.id) ?? { paidDays: 0, hours: 0, overtime: 0 }
    const basis = resolvePayBasis(guard, company?.defaultPayBasis ?? 'DAILY')
    const dailyRate = Number(guard.daily_rate ?? 0)
    const monthlySalary = Number(guard.basic_salary ?? 0)
    // P1-10 (BUG-007): DAILY pay is daily rate x paid days. It used to be
    // basic_salary / standard hours x hours worked, which ignored daily_rate
    // and paid every guard $0.
    const base = computePay({ basis, dailyRate, monthlySalary, hourlyRate: monthlySalary / standardHoursPerMonth, paidDays: att.paidDays, hoursWorked: att.hours, overtimeHours: att.overtime, hoursPerDay, standardHoursPerMonth, grade: guard.employee_type, tables: {} })
    const earningsLines = earningItems.map((item) => ({
      payslipItemId: item.id, name: item.name, type: 'EARNING',
      amount: calculatePayslipItem(item, base.basicSalary, 0),
      calculationMethod: item.calculationMethod,
    }))
    const preGross = r2(base.grossPay + earningsLines.reduce((s, l) => s + l.amount, 0))
    const itemDeductions = deductionItems.map((item) => ({
      payslipItemId: item.id, name: item.name, type: 'DEDUCTION',
      amount: calculatePayslipItem(item, base.basicSalary, preGross),
      calculationMethod: item.calculationMethod,
    }))
    const pay = computePay({
      basis, dailyRate, monthlySalary, hourlyRate: monthlySalary / standardHoursPerMonth,
      paidDays: att.paidDays, hoursWorked: att.hours, overtimeHours: att.overtime, hoursPerDay, standardHoursPerMonth,
      grade: guard.employee_type, tables,
      otherEarnings: earningsLines.map((l) => ({ name: l.name, amount: l.amount })),
      otherDeductions: itemDeductions.map((l) => ({ name: l.name, amount: l.amount })),
    })
    const statutoryLines = pay.deductions
      .filter((d) => !itemDeductions.some((x) => x.name === d.name))
      .map((d) => ({ payslipItemId: null, name: d.name, type: 'DEDUCTION', amount: d.amount, calculationMethod: 'STATUTORY' }))

    return {
      guardId: guard.id, guardName: guard.full_name ?? '', employeeNumber: guard.employee_code ?? '',
      whatsapp: guard.phone, payBasis: basis, paidDays: att.paidDays, dailyRate,
      hoursWorked: r2(att.hours), overtimeHours: r2(att.overtime),
      basicSalary: pay.basicSalary, overtimePay: pay.overtimePay,
      totalEarnings: r2(earningsLines.reduce((s, l) => s + l.amount, 0)),
      grossPay: pay.grossPay, totalDeductions: pay.totalDeductions, netPay: pay.netPay,
      employerContributions: pay.employerContributions, totalEmployerContributions: pay.totalEmployerContributions,
      earningsLines, deductionLines: [...itemDeductions, ...statutoryLines], warnings: pay.warnings,
    }
  })
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runs = await prisma.payrollRun.findMany({
    where: { companyId: session.companyId },
    orderBy: { runDate: 'desc' },
  })

  const [users, bankAccounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: runs.map((r) => r.processedBy) } }, select: { id: true, name: true } }),
    prisma.bankAccount.findMany({ where: { id: { in: runs.map((r) => r.bankAccountId).filter((v): v is string => !!v) } }, select: { id: true, bank_name: true } }),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const bankById = new Map(bankAccounts.map((b) => [b.id, b]))

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      reference: r.reference,
      payPeriodStart: r.periodStart.toISOString(),
      payPeriodEnd: r.periodEnd.toISOString(),
      runDate: r.runDate.toISOString(),
      status: r.status,
      totalGross: Number(r.totalGross),
      totalDeductions: Number(r.totalDeductions),
      totalNet: Number(r.totalNet),
      processedBy: userById.get(r.processedBy) ? { name: userById.get(r.processedBy)!.name } : null,
      bankAccount: r.bankAccountId && bankById.get(r.bankAccountId) ? { name: bankById.get(r.bankAccountId)!.bank_name } : null,
    })),
  })
}

async function payrollAction(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')
  const body = await req.json()

  // ── Preview ──────────────────────────────────────────────────────────────
  if (action === 'preview') {
    const { periodStart, periodEnd } = body
    if (!periodStart || !periodEnd) return NextResponse.json({ error: 'periodStart and periodEnd are required' }, { status: 400 })

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (end <= start) return NextResponse.json({ error: 'periodEnd must be after periodStart' }, { status: 400 })

    const previews = await computePayrollPreviews(companyId, start, end)

    const totalGross = r2(previews.reduce((s, p) => s + p.grossPay, 0))
    const totalDeductions = r2(previews.reduce((s, p) => s + p.totalDeductions, 0))
    const totalNet = r2(previews.reduce((s, p) => s + p.netPay, 0))

    // Shown before confirming; confirm refuses while `problems` is non-empty.
    const problems = payrollRunProblems(previews)
    const warnings = Array.from(new Set(previews.flatMap((p) => p.warnings)))
    return NextResponse.json({ previews, totalGross, totalDeductions, totalNet, problems, warnings })
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    // A3: confirm creates a DRAFT run (payslips, no journal, no money moved).
    // Approving posts it to the GL; paying moves the money. See
    // app/api/hr/payroll/[id]/route.ts. bankAccountId is the intended bank
    // and can be changed when paying.
    const { periodStart, periodEnd, bankAccountId } = body
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Missing required fields', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return NextResponse.json({ error: 'Invalid period dates', code: 'VALIDATION_ERROR' }, { status: 400 })
    if (end <= start) return NextResponse.json({ error: 'periodEnd must be after periodStart', code: 'VALIDATION_ERROR' }, { status: 400 })

    const existingRun = await prisma.payrollRun.findFirst({ where: { companyId, periodStart: start, periodEnd: end } })
    if (existingRun) return NextResponse.json({ error: 'A payroll run for this period already exists', code: 'DUPLICATE_PERIOD' }, { status: 409 })

    const lockError = await checkLockDate(companyId, end)
    if (lockError) return NextResponse.json({ error: lockError, code: 'PERIOD_LOCKED' }, { status: 422 })

    if (bankAccountId) {
      const bankAccount = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
      if (!bankAccount) return NextResponse.json({ error: 'Bank account not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Recomputed from attendance/guard data, never taken from the client.
    const guardPayslips = await computePayrollPreviews(companyId, start, end)
    if (!guardPayslips.length) return NextResponse.json({ error: 'No active guards found for this period', code: 'PAYROLL_INVALID' }, { status: 400 })

    // P1-10: refuse a zero-gross run or any payslip whose net isn't gross
    // minus deductions.
    const problems = payrollRunProblems(guardPayslips)
    if (problems.length) {
      return NextResponse.json({ error: problems[0], code: 'PAYROLL_INVALID', problems }, { status: 400 })
    }

    const totalGross = r2(guardPayslips.reduce((s: number, p: { grossPay: number }) => s + p.grossPay, 0))
    const totalDeductions = r2(guardPayslips.reduce((s: number, p: { totalDeductions: number }) => s + p.totalDeductions, 0))
    const totalNet = r2(guardPayslips.reduce((s: number, p: { netPay: number }) => s + p.netPay, 0))
    const totalEmployer = r2(guardPayslips.reduce((s: number, p: { totalEmployerContributions: number }) => s + p.totalEmployerContributions, 0))

    const reference = await nextJournalReference(companyId)
    const runId = crypto.randomUUID()

    await prisma.$transaction(async (tx) => {
      await tx.payrollRun.create({
        data: {
          id: runId, companyId, reference, periodStart: start, periodEnd: end,
          runDate: new Date(), status: 'DRAFT',
          totalGross, totalDeductions, totalNet, totalEmployerContributions: totalEmployer,
          bankAccountId: bankAccountId || null, processedBy: userId,
        },
      })

      // Batched via createMany (2 round trips) instead of one per guard.
      const nowIso = new Date().toISOString()
      const payDate = end.toISOString().split('T')[0]
      const payslipRows = guardPayslips.map((g) => {
        const payslipId = crypto.randomUUID()
        return {
          id: payslipId, payroll_run_id: runId, employee_id: g.guardId, payslip_number: `PS-${payslipId.substring(0, 8)}`,
          basic_salary: g.basicSalary, net_pay: g.netPay, total_deductions: g.totalDeductions,
          total_earnings: g.grossPay, total_contributions_employer: g.totalEmployerContributions, status: 'Draft', created_by_id: userId,
          hours_worked: g.hoursWorked ?? null, overtime_hours: g.overtimeHours ?? null, overtime_pay: g.overtimePay ?? null,
          created_date: nowIso, pay_date: payDate,
        }
      })
      await tx.payslip.createMany({ data: payslipRows })

      // Every earning and deduction (PAYE, NSSA, AIDS Levy, ...) is its own line.
      const payslipLineRows = guardPayslips.flatMap((g, i) =>
        [...(g.earningsLines ?? []), ...(g.deductionLines ?? [])].map((l: { name: string; type: string; amount: number }) => ({
          id: crypto.randomUUID(), payslipId: payslipRows[i].id, itemName: l.name, itemType: l.type as 'EARNING' | 'DEDUCTION',
          amount: l.amount,
        })),
      )
      if (payslipLineRows.length) {
        await tx.payslipLine.createMany({ data: payslipLineRows })
      }
    }, { timeout: 60000 })

    await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'PayrollRun', recordId: runId, newValues: { reference, status: 'DRAFT', totalGross, totalNet } })
    return NextResponse.json({ success: true, runId, reference, status: 'DRAFT', totalGross, totalDeductions, totalNet, totalEmployerContributions: totalEmployer }, { status: 201 })
  }

  return NextResponse.json({ error: 'Use ?action=preview or ?action=confirm' }, { status: 400 })
}

// A7: an Idempotency-Key makes a retried confirm return the first run
// instead of creating a second one. Preview is read-only and not wrapped.
export async function POST(req: NextRequest) {
  if (new URL(req.url).searchParams.get('action') !== 'confirm') return payrollAction(req)
  return idempotentPost(req, 'POST /api/hr/payroll?action=confirm', () => payrollAction(req))
}
