'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { DismissRegular, DocumentRegular, PrintRegular } from '@fluentui/react-icons';

interface Payslip { id: string; basicSalary: number; overtimePay: number; grossPay: number; totalDeductions: number; netPay: number; hoursWorked: number; overtimeHours: number; status: string; guard: { name: string; employeeNumber: string } | null; payrollRun: { id: string; payPeriodStart: string; payPeriodEnd: string; runDate: string } | null }
interface PayslipDetail extends Payslip { lines: { id: string; name: string; type: string; amount: number }[]; guard: { name: string; employeeNumber: string; idNumber: string | null; department: string | null; rank: string | null }; payrollRun: { id: string; reference: string | null; payPeriodStart: string; payPeriodEnd: string; runDate: string; processedBy: { name: string } | null } | null }
interface PayrollRun { id: string; reference: string; payPeriodStart: string; payPeriodEnd: string }

const STATUS_STYLES: Record<string, string> = { PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', CANCELLED: 'bg-muted text-muted-foreground' }

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRun, setFilterRun] = useState('')
  const [search, setSearch] = useState('')
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  async function fetchPayslips() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterRun) params.set('payrollRunId', filterRun)
    try {
      const res = await fetch(`/api/hr/payslips?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load payslips'); setPayslips([]); return }
      setPayslips(json.payslips ?? [])
    } catch {
      toast.error('Network error loading payslips')
      setPayslips([])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetch('/api/hr/payroll').then(r => r.json()).then(j => setRuns(j.runs ?? [])).catch((err) => console.error(err))
  }, [])
  useEffect(() => { fetchPayslips() }, [filterRun])

  const filteredPayslips = search
    ? payslips.filter(p => p.guard?.name?.toLowerCase().includes(search.toLowerCase()) || p.guard?.employeeNumber?.toLowerCase().includes(search.toLowerCase()))
    : payslips

  async function openDetail(id: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/hr/payslips/${id}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load payslip'); setSelectedPayslip(null); return }
      setSelectedPayslip(json.payslip)
    } catch {
      toast.error('Network error loading payslip')
      setSelectedPayslip(null)
    } finally { setLoadingDetail(false) }
  }

  function printPayslip() {
    window.print()
  }

  return (
    <div className="flex gap-4">
      {/* Main list */}
      <div className="flex-1 min-w-0">
        <PageHeader title="Payslips" description="View and download individual payslips" />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Input placeholder="Search by guard name or emp#…" value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
          <Select value={filterRun} onValueChange={setFilterRun}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All payroll runs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All payroll runs</SelectItem>
              {runs.map(r => <SelectItem key={r.id} value={r.id}>{r.reference} — {formatDate(new Date(r.payPeriodStart))}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filteredPayslips.length === 0 ? (
            <div className="py-16"><EmptyState icon={DocumentRegular} title="No payslips found" description="Process a payroll run to generate payslips" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Guard</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Period</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Deductions</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Net Pay</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPayslips.map((p) => (
                  <tr key={p.id} className={`hover:bg-muted/50 cursor-pointer ${selectedPayslip?.id === p.id ? 'bg-primary/5' : ''}`} onClick={() => openDetail(p.id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{p.guard?.name}</p>
                      <p className="text-xs text-brand-muted-light">{p.guard?.employeeNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{p.payrollRun ? `${formatDate(new Date(p.payrollRun.payPeriodStart))} – ${formatDate(new Date(p.payrollRun.payPeriodEnd))}` : '—'}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(p.grossPay))}</td>
                    <td className="px-4 py-3 text-right text-primary">{formatCurrency(Number(p.totalDeductions))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700 dark:text-green-400">{formatCurrency(Number(p.netPay))}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status] ?? 'bg-muted text-muted-foreground'}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slide-over detail panel */}
      {(selectedPayslip || loadingDetail) && (
        <div className="w-96 shrink-0 rounded-lg border border-border bg-card h-fit sticky top-4 print:w-full print:border-0">
          {loadingDetail ? (
            <div className="py-16 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : selectedPayslip && (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border print:hidden">
                <h3 className="font-semibold text-foreground text-sm">Payslip Detail</h3>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={printPayslip} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Print payslip"><PrintRegular className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setSelectedPayslip(null)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Close panel"><DismissRegular className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Header */}
                <div className="text-center pb-3 border-b border-border">
                  <h4 className="text-base font-bold text-foreground">PAYSLIP</h4>
                  <p className="text-xs text-brand-muted-light mt-0.5">{selectedPayslip.payrollRun?.reference}</p>
                  {selectedPayslip.payrollRun && (
                    <p className="text-xs text-muted-foreground">{formatDate(new Date(selectedPayslip.payrollRun.payPeriodStart))} – {formatDate(new Date(selectedPayslip.payrollRun.payPeriodEnd))}</p>
                  )}
                </div>

                {/* Guard info */}
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-brand-muted-light">Employee</span><span className="text-foreground font-medium">{selectedPayslip.guard.name}</span>
                  <span className="text-brand-muted-light">Emp #</span><span className="text-foreground font-mono">{selectedPayslip.guard.employeeNumber}</span>
                  {selectedPayslip.guard.department && <><span className="text-brand-muted-light">Dept</span><span className="text-foreground">{selectedPayslip.guard.department}</span></>}
                  {selectedPayslip.guard.rank && <><span className="text-brand-muted-light">Rank</span><span className="text-foreground">{selectedPayslip.guard.rank}</span></>}
                  <span className="text-brand-muted-light">Hours</span><span className="text-foreground">{Number(selectedPayslip.hoursWorked).toFixed(1)} hrs</span>
                  <span className="text-brand-muted-light">Overtime</span><span className="text-foreground">{Number(selectedPayslip.overtimeHours).toFixed(1)} hrs</span>
                </div>

                {/* Earnings */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Earnings</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>Basic Salary</span><span className="font-medium">{formatCurrency(Number(selectedPayslip.basicSalary))}</span></div>
                    {Number(selectedPayslip.overtimePay) > 0 && <div className="flex justify-between"><span>Overtime Pay</span><span className="font-medium">{formatCurrency(Number(selectedPayslip.overtimePay))}</span></div>}
                    {selectedPayslip.lines.filter(l => l.type === 'EARNING').map(l => (
                      <div key={l.id} className="flex justify-between"><span>{l.name}</span><span className="font-medium">{formatCurrency(Number(l.amount))}</span></div>
                    ))}
                    <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Gross Pay</span><span>{formatCurrency(Number(selectedPayslip.grossPay))}</span></div>
                  </div>
                </div>

                {/* Deductions */}
                {selectedPayslip.lines.filter(l => l.type === 'DEDUCTION').length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Deductions</p>
                    <div className="space-y-1 text-xs">
                      {selectedPayslip.lines.filter(l => l.type === 'DEDUCTION').map(l => (
                        <div key={l.id} className="flex justify-between text-primary"><span>{l.name}</span><span>({formatCurrency(Number(l.amount))})</span></div>
                      ))}
                      <div className="flex justify-between border-t border-border pt-1 font-semibold text-primary"><span>Total Deductions</span><span>({formatCurrency(Number(selectedPayslip.totalDeductions))})</span></div>
                    </div>
                  </div>
                )}

                {/* Net Pay */}
                <div className="rounded-lg bg-brand-navy text-white px-4 py-3 flex justify-between items-center">
                  <span className="font-semibold text-sm">NET PAY</span>
                  <span className="text-xl font-bold">{formatCurrency(Number(selectedPayslip.netPay))}</span>
                </div>

                {selectedPayslip.payrollRun?.processedBy && (
                  <p className="text-xs text-brand-muted-light text-center">Processed by {selectedPayslip.payrollRun.processedBy.name} on {formatDate(new Date(selectedPayslip.payrollRun.runDate))}</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
