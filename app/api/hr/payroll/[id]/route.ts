import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { checkLockDate } from '@/lib/lock-dates'
import { postJournal, reverseJournalEntry } from '@/lib/gl-posting'
import { ensureSystemAccount } from '@/lib/system-accounts'
import { nextPaymentReference } from '@/lib/auto-numbers'
import { apiError, ApiError } from '@/lib/api-error'

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

// ── A3: payroll lifecycle DRAFT -> APPROVED -> PAID ──────────────────────
//  approve  Dr Salaries (gross + employer contributions)
//           Cr Payroll Liabilities (deductions + employer contributions)
//           Cr Net Pay Payable (net)            -- by someone other than the creator
//  pay      Dr Net Pay Payable / Cr Bank (net)  -- refused if the bank can't cover it
//  reverse  an APPROVED run's journal is reversed and the run goes back to DRAFT
//  DELETE   a DRAFT run (and its payslips) is deleted; nothing else is.

const NET_PAY_PAYABLE = { code: '2210', name: 'Net Pay Payable', type: 'LIABILITY' as const, subtype: 'Current Liability', description: 'Approved net pay not yet paid to employees.' }

function fail(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { companyId, userId } = session
  const action = new URL(req.url).searchParams.get('action')
  const body = await req.json().catch(() => ({}))

  const run = await prisma.payrollRun.findFirst({ where: { id: params.id, companyId } })
  if (!run) return fail('Not found', 'NOT_FOUND', 404)
  const period = `${run.periodStart.toISOString().slice(0, 10)} – ${run.periodEnd.toISOString().slice(0, 10)}`

  try {
    if (action === 'approve') {
      if (run.status !== 'DRAFT') return fail(`Only a DRAFT run can be approved (this one is ${run.status})`, 'INVALID_STATE', 409)
      const lockError = await checkLockDate(companyId, run.periodEnd)
      if (lockError) return fail(lockError, 'PERIOD_LOCKED', 422)

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { payrollRequireSecondApprover: true, salariesExpenseAccountId: true, payrollLiabilitiesAccountId: true, netPayPayableAccountId: true },
      })
      const ownRun = run.processedBy === userId
      const override = ownRun && session.role === 'SUPER_ADMIN' && body?.override === true
      if (company?.payrollRequireSecondApprover !== false && ownRun && !override) {
        return fail('A payroll run must be approved by someone other than the person who created it.', 'SECOND_APPROVER_REQUIRED', 403)
      }
      if (!company?.salariesExpenseAccountId) return fail('Salaries Expense account is not configured. Set it in Settings → Company → Tax.', 'ACCOUNT_NOT_CONFIGURED', 400)
      const deductions = Number(run.totalDeductions), employer = Number(run.totalEmployerContributions)
      const liabilities = r2(deductions + employer)
      if (liabilities > 0 && !company.payrollLiabilitiesAccountId) {
        return fail('This payroll run has deductions, but no Payroll Liabilities account is configured. Set it in Settings → Company → Tax.', 'ACCOUNT_NOT_CONFIGURED', 400)
      }

      await prisma.$transaction(async (tx) => {
        const claimed = await tx.payrollRun.updateMany({ where: { id: run.id, status: 'DRAFT' }, data: { status: 'APPROVED', approvedBy: userId, approvedAt: new Date() } })
        if (claimed.count === 0) throw new ApiError('This run is no longer DRAFT', 409, 'INVALID_STATE')
        const netPayAccountId = company.netPayPayableAccountId ?? (await ensureSystemAccount(tx, companyId, NET_PAY_PAYABLE))
        const journalId = await postJournal(tx, {
          companyId, reference: run.reference ?? `PAYROLL-${run.id.slice(0, 8)}`,
          entryDate: run.periodEnd.toISOString(),
          description: `Payroll ${period}`,
          lines: [
            { accountId: company.salariesExpenseAccountId!, debit: r2(Number(run.totalGross) + employer), description: 'Salaries and wages incl. employer contributions' },
            ...(liabilities > 0 ? [{ accountId: company.payrollLiabilitiesAccountId!, credit: liabilities, description: 'PAYE, NSSA and other payroll liabilities' }] : []),
            { accountId: netPayAccountId, credit: Number(run.totalNet), description: 'Net pay payable' },
          ],
          userId, sourceType: 'payrollRun', sourceId: run.id,
        })
        await tx.payrollRun.update({ where: { id: run.id }, data: { approvalJournalId: journalId } })
        await tx.payslip.updateMany({ where: { payroll_run_id: run.id }, data: { status: 'Approved' } })
        await logAudit({ companyId, userId, userName: session.name, action: 'APPROVE', module: 'PayrollRun', recordId: run.id, oldValues: { status: 'DRAFT' }, newValues: { status: 'APPROVED', ...(override && { override: true }) } }, tx)
      }, { timeout: 60000 })
      return NextResponse.json({ run: await prisma.payrollRun.findUnique({ where: { id: run.id } }) })
    }

    if (action === 'pay') {
      if (run.status !== 'APPROVED') {
        return run.status === 'PAID'
          ? fail('This payroll run has already been paid', 'INVALID_STATE', 409)
          : fail('This payroll run must be approved before it can be paid', 'PAYROLL_NOT_APPROVED', 409)
      }
      const paymentDate = body?.paymentDate ? new Date(body.paymentDate) : new Date()
      if (isNaN(paymentDate.getTime())) return fail('Invalid payment date', 'VALIDATION_ERROR', 400)
      const lockError = await checkLockDate(companyId, paymentDate)
      if (lockError) return fail(lockError, 'PERIOD_LOCKED', 422)
      const bankAccountId: string | null = body?.bankAccountId || run.bankAccountId
      if (!bankAccountId) return fail('Choose the bank account to pay from', 'VALIDATION_ERROR', 400)
      const bank = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
      if (!bank) return fail('Bank account not found', 'NOT_FOUND', 404)
      if (!bank.chart_account_id) return fail('The selected bank account has no linked GL account', 'BANK_NOT_LINKED', 400)
      const net = Number(run.totalNet)
      if (Number(bank.current_balance ?? 0) < net) return fail(`Insufficient bank funds (${Number(bank.current_balance ?? 0).toFixed(2)}) for net pay of ${net.toFixed(2)}`, 'INSUFFICIENT_FUNDS', 400)

      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { netPayPayableAccountId: true } })
      const paymentReference = await nextPaymentReference(companyId)
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.payrollRun.updateMany({ where: { id: run.id, status: 'APPROVED' }, data: { status: 'PAID', paidBy: userId, paidAt: new Date(), bankAccountId } })
        if (claimed.count === 0) throw new ApiError('This run is no longer APPROVED', 409, 'INVALID_STATE')
        // Same guarded decrement as payments: no overdraft under concurrency.
        const decremented = await tx.bankAccount.updateMany({ where: { id: bankAccountId, current_balance: { gte: net } }, data: { current_balance: { decrement: net } } })
        if (decremented.count === 0) throw new ApiError('Insufficient bank funds', 400, 'INSUFFICIENT_FUNDS')
        const netPayAccountId = company?.netPayPayableAccountId ?? (await ensureSystemAccount(tx, companyId, NET_PAY_PAYABLE))
        const journalId = await postJournal(tx, {
          companyId, reference: `JE-auto-${paymentReference}`,
          entryDate: paymentDate.toISOString(),
          description: `Payroll payment ${period}`,
          lines: [
            { accountId: netPayAccountId, debit: net, description: 'Net pay paid' },
            { accountId: bank.chart_account_id!, credit: net, description: 'Bank payment' },
          ],
          userId, sourceType: 'payrollPayment', sourceId: run.id,
        })
        await tx.payrollRun.update({ where: { id: run.id }, data: { paymentJournalId: journalId } })
        await tx.payslip.updateMany({ where: { payroll_run_id: run.id }, data: { status: 'Paid' } })
        // A Payment row keeps payroll visible in cash-out KPIs and the bank register.
        await tx.payment.create({
          data: {
            id: crypto.randomUUID(), companyId, bank_account_id: bankAccountId, bank_account_name: bank.account_name ?? '',
            payment_number: paymentReference, amount: net, payment_date: paymentDate.toISOString(),
            payment_method: 'Bank Transfer', payment_type: 'Payroll Payment', description: `Payroll ${period}`,
            party_name: 'Payroll', currency: bank.currency ?? 'USD', status: 'Posted', journal_entry_id: journalId,
            created_by_id: userId, created_by: session.name, created_date: new Date().toISOString(), updated_date: new Date().toISOString(),
          },
        })
        await logAudit({ companyId, userId, userName: session.name, action: 'UPDATE', module: 'PayrollRun', recordId: run.id, oldValues: { status: 'APPROVED' }, newValues: { status: 'PAID', bankAccountId, amount: net } }, tx)
      }, { timeout: 60000 })
      notifyPayslips(run.id, period).catch(() => {})
      return NextResponse.json({ run: await prisma.payrollRun.findUnique({ where: { id: run.id } }) })
    }

    if (action === 'reverse') {
      if (run.status !== 'APPROVED') return fail(`Only an APPROVED (unpaid) run can be reversed (this one is ${run.status})`, 'INVALID_STATE', 409)
      const lockError = await checkLockDate(companyId, run.periodEnd)
      if (lockError) return fail(lockError, 'PERIOD_LOCKED', 422)
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.payrollRun.updateMany({ where: { id: run.id, status: 'APPROVED' }, data: { status: 'DRAFT', approvedBy: null, approvedAt: null, approvalJournalId: null } })
        if (claimed.count === 0) throw new ApiError('This run is no longer APPROVED', 409, 'INVALID_STATE')
        if (run.approvalJournalId) await reverseJournalEntry(tx, run.approvalJournalId)
        await tx.payslip.updateMany({ where: { payroll_run_id: run.id }, data: { status: 'Draft' } })
        await logAudit({ companyId, userId, userName: session.name, action: 'VOID', module: 'PayrollRun', recordId: run.id, oldValues: { status: 'APPROVED' }, newValues: { status: 'DRAFT' } }, tx)
      }, { timeout: 60000 })
      return NextResponse.json({ run: await prisma.payrollRun.findUnique({ where: { id: run.id } }) })
    }
  } catch (err) {
    return apiError(err, 'Payroll action failed', 400)
  }

  return fail('Use ?action=approve, pay or reverse', 'VALIDATION_ERROR', 400)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const run = await prisma.payrollRun.findFirst({ where: { id: params.id, companyId: session.companyId } })
  if (!run) return fail('Not found', 'NOT_FOUND', 404)
  if (run.status !== 'DRAFT') return fail(`Only a DRAFT run can be deleted (this one is ${run.status})`, 'INVALID_STATE', 409)
  await prisma.$transaction(async (tx) => {
    const slips = await tx.payslip.findMany({ where: { payroll_run_id: run.id }, select: { id: true } })
    await tx.payslipLine.deleteMany({ where: { payslipId: { in: slips.map((s) => s.id) } } })
    await tx.payslip.deleteMany({ where: { payroll_run_id: run.id } })
    await tx.payrollRun.deleteMany({ where: { id: run.id, status: 'DRAFT' } })
    await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'DELETE', module: 'PayrollRun', recordId: run.id, oldValues: { status: 'DRAFT', totalNet: Number(run.totalNet) } }, tx)
  })
  return NextResponse.json({ success: true })
}

// WhatsApp payslip notifications once pay has actually gone out (fire-and-forget).
async function notifyPayslips(runId: string, period: string) {
  const url = process.env.WHATSAPP_WEBHOOK_URL
  if (!url) return
  const slips = await prisma.payslip.findMany({ where: { payroll_run_id: runId }, select: { employee_id: true, total_earnings: true, total_deductions: true, net_pay: true } })
  const guards = await prisma.guard.findMany({ where: { id: { in: slips.map((s) => s.employee_id).filter((v): v is string => !!v) } }, select: { id: true, full_name: true, phone: true } })
  const byId = new Map(guards.map((g) => [g.id, g]))
  for (const s of slips) {
    const g = s.employee_id ? byId.get(s.employee_id) : undefined
    if (!g?.phone) continue
    const msg = `\u{1F4B0} Payslip Ready — ${g.full_name ?? ''}\nPeriod: ${period}\nGross: ${Number(s.total_earnings).toFixed(2)} | Deductions: ${Number(s.total_deductions).toFixed(2)} | Net Pay: ${Number(s.net_pay).toFixed(2)}\n— Ravenshield ERP`
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: g.phone, message: msg }) }).catch(() => {})
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100
