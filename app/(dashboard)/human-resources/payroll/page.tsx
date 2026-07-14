'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { CheckmarkCircleRegular, ChevronLeftRegular, LinkRegular } from '@fluentui/react-icons';

interface BankAccount { id: string; name: string; currency: string; currentBalance: number }
interface GuardPreview { guardId: string; guardName: string; employeeNumber: string; hoursWorked: number; overtimeHours: number; basicSalary: number; overtimePay: number; totalEarnings: number; grossPay: number; totalDeductions: number; netPay: number; earningsLines: { name: string; amount: number }[]; deductionLines: { name: string; amount: number }[] }
interface PreviewResult { previews: GuardPreview[]; totalGross: number; totalDeductions: number; totalNet: number }
interface PayrollRun { id: string; reference: string; payPeriodStart: string; payPeriodEnd: string; runDate: string; totalGross: number; totalDeductions: number; totalNet: number; status: string; processedBy: { name: string } | null; bankAccount: { name: string } | null }
type SetupForm = { periodStart: string; periodEnd: string; bankAccountId: string }

const STATUS_STYLES: Record<string, string> = { CONFIRMED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', DRAFT: 'bg-muted text-muted-foreground', CANCELLED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }

export default function PayrollPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [confirming, setConfirming] = useState(false)
  const [confirmedResult, setConfirmedResult] = useState<{ runId: string; reference: string; totalGross: number; totalDeductions: number; totalNet: number } | null>(null)
  const [setupData, setSetupData] = useState<SetupForm | null>(null)

  const { register, handleSubmit, control, getValues, formState: { isSubmitting } } = useForm<SetupForm>({
    defaultValues: { periodStart: '', periodEnd: '', bankAccountId: '' },
  })

  async function fetchRuns() {
    try {
      const res = await fetch('/api/hr/payroll')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load payroll runs'); return }
      setRuns(json.runs ?? [])
    } catch {
      toast.error('Network error loading payroll runs')
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [ba, pr] = await Promise.all([
          fetch('/api/finance/bank-accounts').then(r => r.json()),
          fetch('/api/hr/payroll').then(r => r.json()),
        ])
        setBankAccounts(ba.accounts ?? [])
        setRuns(pr.runs ?? [])
      } catch {
        toast.error('Network error loading payroll data')
      }
    })()
  }, [])

  async function onCalculate(data: SetupForm) {
    if (!data.periodStart || !data.periodEnd) { toast.error('Select period dates'); return }
    if (!data.bankAccountId) { toast.error('Select a bank account'); return }
    if (data.periodEnd <= data.periodStart) { toast.error('Period end must be after start'); return }
    setSetupData(data)
    const res = await fetch('/api/hr/payroll?action=preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodStart: data.periodStart, periodEnd: data.periodEnd }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    if (!json.previews?.length) { toast.error('No active guards found'); return }
    setPreview(json); setStep(2)
  }

  async function onConfirm() {
    if (!preview || !setupData) return
    setConfirming(true)
    try {
      const res = await fetch('/api/hr/payroll?action=confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart: setupData.periodStart, periodEnd: setupData.periodEnd, bankAccountId: setupData.bankAccountId, guardPayslips: preview.previews }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      setConfirmedResult(json); setStep(3); fetchRuns()
    } finally { setConfirming(false) }
  }

  const selectedBank = bankAccounts.find(b => b.id === setupData?.bankAccountId)

  return (
    <div>
      <PageHeader title="Payroll" description="Calculate and process guard payroll" />

      {/* Wizard */}
      <div className="mt-4 rounded-lg border border-border bg-card">
        {/* Step Indicator */}
        <div className="flex border-b border-border">
          {(['1. Setup', '2. Preview', '3. Confirm'] as const).map((label, i) => (
            <div key={label} className={`flex-1 px-4 py-3 text-xs font-medium text-center border-b-2 ${step === i + 1 ? 'border-primary text-primary' : step > i + 1 ? 'border-green-400 text-green-600 dark:text-green-400' : 'border-transparent text-brand-muted-light'}`}>{label}</div>
          ))}
        </div>

        <div className="p-6">
          {/* Step 1 — Setup */}
          {step === 1 && (
            <form onSubmit={handleSubmit(onCalculate)} className="max-w-md space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Period Start *</Label><Input type="date" {...register('periodStart', { required: true })} /></div>
                <div className="space-y-1.5"><Label>Period End *</Label><Input type="date" {...register('periodEnd', { required: true })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Pay From Account *</Label>
                <Controller control={control} name="bankAccountId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name} — {formatCurrency(Number(b.currentBalance))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {isSubmitting ? 'Calculating…' : 'Calculate Payroll Preview'}
              </Button>
            </form>
          )}

          {/* Step 2 — Preview */}
          {step === 2 && preview && (
            <div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Guard</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Hours</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">OT Hrs</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Basic</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">OT Pay</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Earnings</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Gross</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Deductions</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground font-semibold">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.previews.map((g) => (
                      <tr key={g.guardId} className="hover:bg-muted/50">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-foreground">{g.guardName}</p>
                          <p className="text-xs text-brand-muted-light">{g.employeeNumber}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{Number(g.hoursWorked).toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-600">{Number(g.overtimeHours).toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(Number(g.basicSalary))}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(Number(g.overtimePay))}</td>
                        <td className="px-3 py-2.5 text-right text-green-600 dark:text-green-400">{formatCurrency(Number(g.totalEarnings))}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(Number(g.grossPay))}</td>
                        <td className="px-3 py-2.5 text-right text-primary">{formatCurrency(Number(g.totalDeductions))}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatCurrency(Number(g.netPay))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/50">
                    <tr>
                      <td className="px-3 py-2.5 font-semibold text-foreground" colSpan={6}>Totals ({preview.previews.length} guards)</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(preview.totalGross)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-primary">{formatCurrency(preview.totalDeductions)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-primary">{formatCurrency(preview.totalNet)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedBank && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-sm">
                  <span className="font-medium text-amber-800 dark:text-amber-400">Bank deduction: </span>
                  <span className="text-amber-700 dark:text-amber-400">{formatCurrency(preview.totalNet)} will be deducted from <strong>{selectedBank.name}</strong> (current balance: {formatCurrency(Number(selectedBank.currentBalance))})</span>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(1)}><ChevronLeftRegular className="h-4 w-4 mr-1" /> Back to Setup</Button>
                <Button type="button" disabled={confirming} onClick={onConfirm} className="bg-primary hover:bg-brand-red-dark text-white">{confirming ? 'Processing…' : 'Confirm & Process Payroll'}</Button>
              </div>
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 3 && confirmedResult && (
            <div className="text-center py-8">
              <CheckmarkCircleRegular className="h-14 w-14 text-green-500 dark:text-green-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-1">Payroll Processed</h2>
              <p className="text-muted-foreground text-sm mb-4">Reference: <span className="font-mono font-medium">{confirmedResult.reference}</span></p>
              <div className="inline-grid grid-cols-3 gap-6 text-center mb-6">
                <div><p className="text-xs text-brand-muted-light mb-0.5">Total Gross</p><p className="font-semibold">{formatCurrency(confirmedResult.totalGross)}</p></div>
                <div><p className="text-xs text-brand-muted-light mb-0.5">Deductions</p><p className="font-semibold text-primary">{formatCurrency(confirmedResult.totalDeductions)}</p></div>
                <div><p className="text-xs text-brand-muted-light mb-0.5">Net Paid</p><p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(confirmedResult.totalNet)}</p></div>
              </div>
              <div className="flex items-center justify-center gap-4">
                <Link href="/human-resources/payslips" className="text-sm text-primary hover:underline flex items-center gap-1"><LinkRegular className="h-3.5 w-3.5" /> View Payslips</Link>
                <button type="button" onClick={() => { setStep(1); setPreview(null); setConfirmedResult(null) }} className="text-sm text-muted-foreground hover:underline">Run Another Payroll</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Past Payroll Runs */}
      {runs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Past Payroll Runs</h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Period</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Run Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Net</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.reference}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(r.payPeriodStart))} – {formatDate(new Date(r.payPeriodEnd))}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(r.runDate))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(r.totalGross))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700 dark:text-green-400">{formatCurrency(Number(r.totalNet))}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? 'bg-muted text-muted-foreground'}`}>{r.status}</span></td>
                    <td className="px-4 py-3">
                      <Link href={`/human-resources/payslips?payrollRunId=${r.id}`} className="text-xs text-primary hover:underline">View payslips</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
