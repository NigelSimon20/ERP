import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextJournalReference } from '@/lib/auto-numbers'
import { calculateBasicSalary, calculateOvertimePay, calculatePayslipItem } from '@/lib/calculations'
import { checkLockDate } from '@/lib/lock-dates'

function r2(n: number) { return Math.round(n * 100) / 100 }

// Shared by preview and confirm so a payroll run is always paid out exactly
// what preview showed — confirm previously trusted client-submitted amounts
// wholesale, letting a tampered/inflated request body pay out more than
// earned and post it as a legitimate, balanced GL entry with no cross-check.
async function computePayrollPreviews(companyId: string, start: Date, end: Date) {
  const [guards, payslipItems, company] = await Promise.all([
    prisma.guard.findMany({ where: { companyId, status: 'Active' } }),
    prisma.payslipItem.findMany({ where: { companyId, active: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { standardHoursPerMonth: true } }),
  ])
  const standardHoursPerMonth = company?.standardHoursPerMonth ?? 160

  const earningItems = payslipItems.filter((i) => i.itemType === 'EARNING')
  const deductionItems = payslipItems.filter((i) => i.itemType === 'DEDUCTION')

  // One query for every guard's attendance instead of one concurrent query
  // per guard — with hundreds of active guards, firing that many parallel
  // requests at once was unreliable against this DB's pooler (connections
  // getting dropped mid-batch) and could 500 the whole preview/confirm.
  const attendanceRows = await prisma.attendance.findMany({
    where: { guardId: { in: guards.map((g) => g.id) }, date: { gte: start, lte: end } },
    select: { guardId: true, hoursWorked: true, overtimeHours: true },
  })
  const attendanceByGuard = new Map<string, { hoursWorked: unknown; overtimeHours: unknown }[]>()
  for (const row of attendanceRows) {
    const list = attendanceByGuard.get(row.guardId) ?? []
    list.push(row)
    attendanceByGuard.set(row.guardId, list)
  }

  return guards.map((guard) => {
    const attendance = attendanceByGuard.get(guard.id) ?? []

    const hoursWorked = r2(attendance.reduce((s, a) => s + Number(a.hoursWorked), 0))
    const overtimeHours = r2(attendance.reduce((s, a) => s + Number(a.overtimeHours), 0))
    const hourlyRate = Number(guard.basic_salary ?? 0) / standardHoursPerMonth // estimate from basic salary, using the company's configured standard monthly hours

    const basicSalary = calculateBasicSalary(hoursWorked, hourlyRate)
    const overtimePay = calculateOvertimePay(overtimeHours, hourlyRate)

    const earningsLines = earningItems.map((item) => ({
      payslipItemId: item.id, name: item.name, type: 'EARNING',
      amount: calculatePayslipItem(item, basicSalary, 0),
      calculationMethod: item.calculationMethod,
    }))
    const totalEarnings = r2(earningsLines.reduce((s, l) => s + l.amount, 0))
    const grossPay = r2(basicSalary + overtimePay + totalEarnings)

    const deductionLines = deductionItems.map((item) => ({
      payslipItemId: item.id, name: item.name, type: 'DEDUCTION',
      amount: calculatePayslipItem(item, basicSalary, grossPay),
      calculationMethod: item.calculationMethod,
    }))
    const totalDeductions = r2(deductionLines.reduce((s, l) => s + l.amount, 0))
    const netPay = r2(grossPay - totalDeductions)

    return {
      guardId: guard.id, guardName: guard.full_name ?? '', employeeNumber: guard.employee_code ?? '',
      whatsapp: guard.phone, hoursWorked, overtimeHours, hourlyRate,
      basicSalary, overtimePay, totalEarnings, grossPay, totalDeductions, netPay,
      earningsLines, deductionLines,
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
      reference: null,
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

export async function POST(req: NextRequest) {
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

    return NextResponse.json({ previews, totalGross, totalDeductions, totalNet })
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    const { periodStart, periodEnd, bankAccountId } = body
    if (!periodStart || !periodEnd || !bankAccountId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (end <= start) return NextResponse.json({ error: 'periodEnd must be after periodStart' }, { status: 400 })

    const existingRun = await prisma.payrollRun.findFirst({ where: { companyId, periodStart: start, periodEnd: end } })
    if (existingRun) return NextResponse.json({ error: 'A payroll run for this period has already been processed' }, { status: 409 })

    const lockError = await checkLockDate(companyId, end)
    if (lockError) return NextResponse.json({ error: lockError }, { status: 422 })

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

    // Recompute from Attendance/guard data rather than trusting whatever the
    // client submits — this used to accept the request body's grossPay/
    // netPay/etc. wholesale and post them straight to the GL and bank
    // balance with no server-side cross-check.
    const guardPayslips = await computePayrollPreviews(companyId, start, end)
    if (!guardPayslips.length) return NextResponse.json({ error: 'No active guards found for this period' }, { status: 400 })

    const totalGross = r2(guardPayslips.reduce((s: number, p: { grossPay: number }) => s + p.grossPay, 0))
    const totalDeductions = r2(guardPayslips.reduce((s: number, p: { totalDeductions: number }) => s + p.totalDeductions, 0))
    const totalNet = r2(guardPayslips.reduce((s: number, p: { netPay: number }) => s + p.netPay, 0))

    const reference = await nextJournalReference(companyId)
    const runId = crypto.randomUUID()
    const journalId = crypto.randomUUID()

    // Match real chart-of-account names exactly rather than guessing by
    // substring — the previous 'alary'/'bank' substring tricks assumed
    // singular "Salary" (real account is plural "Salaries Expense") and
    // never matched anything for "bank" at all (real accounts are
    // capitalized "Bank ..."), and the liability lookup had no name filter
    // whatsoever, matching whichever LIABILITY account sorted first.
    const [expenseAccount, liabilityAccount] = await Promise.all([
      prisma.chartOfAccount.findFirst({ where: { companyId, account_type: 'EXPENSE', account_name: 'Salaries Expense' } }),
      prisma.chartOfAccount.findFirst({ where: { companyId, account_type: 'LIABILITY', account_name: 'Payroll Liabilities' } }),
    ])

    // Use the disbursement bank account's own linked GL account, same as
    // receipts/payments/transfers already do, instead of guessing by name.
    const bankChartAccount = bankAccount.chart_account_id
      ? await prisma.chartOfAccount.findUnique({ where: { id: bankAccount.chart_account_id } })
      : null

    await prisma.$transaction(async (tx) => {
      await tx.payrollRun.create({
        data: {
          id: runId, companyId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd),
          runDate: new Date(), status: 'PAID',
          totalGross, totalDeductions, totalNet,
          bankAccountId, processedBy: userId,
        },
      })

      // Batched via createMany (2 round trips total) instead of one
      // payslip.create + payslipLine.createMany per guard — with hundreds of
      // active guards, the per-guard loop meant hundreds of sequential
      // round trips inside a single interactive transaction, which reliably
      // exceeded the transaction timeout against this DB's pooler latency.
      const payslipRows = guardPayslips.map((g) => {
        const payslipId = crypto.randomUUID()
        return {
          id: payslipId, payroll_run_id: runId, employee_id: g.guardId, payslip_number: `PS-${payslipId.substring(0, 8)}`,
          basic_salary: g.basicSalary, net_pay: g.netPay, total_deductions: g.totalDeductions,
          total_earnings: g.grossPay, status: 'Approved', created_by_id: userId,
          hours_worked: g.hoursWorked ?? null, overtime_hours: g.overtimeHours ?? null, overtime_pay: g.overtimePay ?? null,
        }
      })
      await tx.payslip.createMany({ data: payslipRows })

      const payslipLineRows = guardPayslips.flatMap((g, i) =>
        [...(g.earningsLines ?? []), ...(g.deductionLines ?? [])].map((l: { name: string; type: string; amount: number; calculationMethod: string }) => ({
          id: crypto.randomUUID(), payslipId: payslipRows[i].id, itemName: l.name, itemType: l.type as any,
          amount: l.amount,
        })),
      )
      if (payslipLineRows.length) {
        await tx.payslipLine.createMany({ data: payslipLineRows })
      }

      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { current_balance: { decrement: totalNet } },
      })

      const journalLines = []
      if (expenseAccount) {
        journalLines.push({ id: crypto.randomUUID(), journalId, accountId: expenseAccount.id, type: 'DEBIT', amount: totalGross, description: 'Salary expense' })
      }
      if (liabilityAccount && totalDeductions > 0) {
        journalLines.push({ id: crypto.randomUUID(), journalId, accountId: liabilityAccount.id, type: 'CREDIT', amount: totalDeductions, description: 'Payroll deductions payable' })
      }
      if (bankChartAccount) {
        journalLines.push({ id: crypto.randomUUID(), journalId, accountId: bankChartAccount.id, type: 'CREDIT', amount: totalNet, description: 'Bank payment' })
      }
      if (journalLines.length) {
        await tx.journalEntry.create({
          data: {
            id: journalId, companyId, reference,
            entry_date: new Date().toISOString(),
            description: `Payroll ${new Date(periodStart).toLocaleDateString()} – ${new Date(periodEnd).toLocaleDateString()}`,
            total_debit: totalGross, total_credit: totalGross,
            status: 'POSTED', created_by_id: userId,
          },
        })
        await tx.journalLine.createMany({
          data: journalLines.map((l) => ({
            id: l.id, journalEntryId: journalId, accountId: l.accountId,
            description: l.description, debit: l.type === 'DEBIT' ? l.amount : 0, credit: l.type === 'CREDIT' ? l.amount : 0,
          })),
        })
      }
    }, { timeout: 60000 })

    // WhatsApp payslip notifications (fire-and-forget)
    if (process.env.WHATSAPP_WEBHOOK_URL) {
      for (const g of guardPayslips) {
        if (g.whatsapp) {
          const msg = `\u{1F4B0} Payslip Ready — ${g.guardName}\nPeriod: ${new Date(periodStart).toLocaleDateString()} to ${new Date(periodEnd).toLocaleDateString()}\nGross: ${Number(g.grossPay).toFixed(2)} | Deductions: ${Number(g.totalDeductions).toFixed(2)} | Net Pay: ${Number(g.netPay).toFixed(2)}\n— Ravenshield ERP`
          fetch(process.env.WHATSAPP_WEBHOOK_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: g.whatsapp, message: msg }),
          }).catch(() => {})
        }
      }
    }

    await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'PayrollRun', recordId: runId, newValues: { reference, totalGross, totalNet } })
    return NextResponse.json({ success: true, runId, reference, totalGross, totalDeductions, totalNet }, { status: 201 })
  }

  return NextResponse.json({ error: 'Use ?action=preview or ?action=confirm' }, { status: 400 })
}
