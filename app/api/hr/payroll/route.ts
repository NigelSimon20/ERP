import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextJournalReference } from '@/lib/auto-numbers'
import { calculateBasicSalary, calculateOvertimePay, calculatePayslipItem } from '@/lib/calculations'

function r2(n: number) { return Math.round(n * 100) / 100 }

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runs = await prisma.payrollRun.findMany({
    where: { companyId: session.companyId },
    orderBy: { runDate: 'desc' },
  })

  return NextResponse.json({ runs })
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

    const [guards, payslipItems, company] = await Promise.all([
      prisma.guard.findMany({ where: { companyId, status: 'ACTIVE' } }),
      prisma.payslipItem.findMany({ where: { companyId, active: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { standardHoursPerMonth: true } }),
    ])
    const standardHoursPerMonth = company?.standardHoursPerMonth ?? 160

    const earningItems = payslipItems.filter((i) => i.itemType === 'EARNING')
    const deductionItems = payslipItems.filter((i) => i.itemType === 'DEDUCTION')

    const previews = await Promise.all(guards.map(async (guard) => {
      const attendance = await prisma.attendance.findMany({
        where: { guardId: guard.id, date: { gte: start, lte: end } },
        select: { hoursWorked: true, overtimeHours: true },
      })

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
    }))

    const totalGross = r2(previews.reduce((s, p) => s + p.grossPay, 0))
    const totalDeductions = r2(previews.reduce((s, p) => s + p.totalDeductions, 0))
    const totalNet = r2(previews.reduce((s, p) => s + p.netPay, 0))

    return NextResponse.json({ previews, totalGross, totalDeductions, totalNet })
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    const { periodStart, periodEnd, bankAccountId, guardPayslips } = body
    if (!periodStart || !periodEnd || !bankAccountId || !guardPayslips?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const bankAccount = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
    if (!bankAccount) return NextResponse.json({ error: 'Bank account not found' }, { status: 404 })

    const totalGross = r2(guardPayslips.reduce((s: number, p: { grossPay: number }) => s + p.grossPay, 0))
    const totalDeductions = r2(guardPayslips.reduce((s: number, p: { totalDeductions: number }) => s + p.totalDeductions, 0))
    const totalNet = r2(guardPayslips.reduce((s: number, p: { netPay: number }) => s + p.netPay, 0))

    const reference = await nextJournalReference(companyId)
    const runId = crypto.randomUUID()
    const journalId = crypto.randomUUID()

    const [expenseAccount, liabilityAccount] = await Promise.all([
      prisma.chartOfAccount.findFirst({ where: { companyId, account_type: 'EXPENSE', account_name: { contains: 'alary' } } }),
      prisma.chartOfAccount.findFirst({ where: { companyId, account_type: 'LIABILITY' } }),
    ])

    const bankChartAccount = await prisma.chartOfAccount.findFirst({
      where: { companyId, account_type: 'ASSET', account_name: { contains: 'bank' } },
    })

    await prisma.$transaction(async (tx) => {
      await tx.payrollRun.create({
        data: {
          id: runId, companyId, periodStart: new Date(periodStart), periodEnd: new Date(periodEnd),
          runDate: new Date(), status: 'PAID',
          totalGross, totalDeductions, totalNet,
          bankAccountId, processedBy: userId,
        },
      })

      for (const g of guardPayslips) {
        const payslipId = crypto.randomUUID()
        await tx.payslip.create({
          data: {
            id: payslipId, payroll_run_id: runId, employee_id: g.guardId, payslip_number: `PS-${payslipId.substring(0, 8)}`,
            basic_salary: g.basicSalary, net_pay: g.netPay, total_deductions: g.totalDeductions,
            total_earnings: g.grossPay, status: 'PAID', created_by_id: userId,
          },
        })
        const allLines = [...(g.earningsLines ?? []), ...(g.deductionLines ?? [])]
        if (allLines.length) {
          await tx.payslipLine.createMany({
            data: allLines.map((l: { name: string; type: string; amount: number; calculationMethod: string }) => ({
              id: crypto.randomUUID(), payslipId, itemName: l.name, itemType: l.type as any,
              amount: l.amount,
            })),
          })
        }
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
    })

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
