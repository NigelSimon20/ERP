'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowTrendingRegular, CalendarLtrRegular, MoneyRegular, PeopleRegular } from '@fluentui/react-icons';

interface PayrollRun { id: string; runDate: string; payPeriodStart: string; payPeriodEnd: string; status: string; totalGross: number; totalDeductions: number; totalNet: number; bankAccount: { bankName: string } | null; processedByUser: { name: string } | null; payslipCount: number }
interface Summary { thisMonthTotal: number; thisYearTotal: number; avgNetPayPerGuard: number; guardsOnLastRun: number }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function FinancePayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [summary, setSummary] = useState<Summary>({ thisMonthTotal: 0, thisYearTotal: 0, avgNetPayPerGuard: 0, guardsOnLastRun: 0 })
  const [loading, setLoading] = useState(true)
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [filterMonth, setFilterMonth] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterYear) params.set('year', filterYear)
    if (filterMonth) params.set('month', filterMonth)
    fetch(`/api/finance/payroll?${params}`).then(r => r.json()).then(json => {
      setRuns(json.runs ?? [])
      setSummary({ thisMonthTotal: json.thisMonthTotal ?? 0, thisYearTotal: json.thisYearTotal ?? 0, avgNetPayPerGuard: json.avgNetPayPerGuard ?? 0, guardsOnLastRun: json.guardsOnLastRun ?? 0 })
    }).finally(() => setLoading(false))
  }, [filterYear, filterMonth])

  const years = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <div>
      <PageHeader title="Payroll Overview" description="Read-only finance view of payroll runs" />

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><CalendarLtrRegular className="h-4 w-4 text-brand-muted-light" /><p className="text-xs text-muted-foreground">This Month</p></div>
          <p className="text-xl font-bold text-primary">{formatCurrency(summary.thisMonthTotal)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowTrendingRegular className="h-4 w-4 text-brand-muted-light" /><p className="text-xs text-muted-foreground">Year-to-Date</p></div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(summary.thisYearTotal)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><MoneyRegular className="h-4 w-4 text-brand-muted-light" /><p className="text-xs text-muted-foreground">Avg Net Pay/Guard</p></div>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(summary.avgNetPayPerGuard)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1"><PeopleRegular className="h-4 w-4 text-brand-muted-light" /><p className="text-xs text-muted-foreground">Guards (Last Run)</p></div>
          <p className="text-xl font-bold text-foreground">{summary.guardsOnLastRun}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex items-center gap-3">
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All months" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-24 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /></div>)}</div>
        ) : runs.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No payroll runs found" description="Payroll runs are managed from the HR Payroll module" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Run Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Period</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Guards</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Deductions</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Net Pay</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bank</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Processed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(r.runDate))}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(r.payPeriodStart))} – {formatDate(new Date(r.payPeriodEnd))}</td>
                  <td className="px-4 py-3 text-right text-foreground">{r.payslipCount}</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatCurrency(Number(r.totalGross))}</td>
                  <td className="px-4 py-3 text-right text-primary">{formatCurrency(Number(r.totalDeductions))}</td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(Number(r.totalNet))}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.bankAccount?.bankName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : r.status === 'PROCESSING' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.processedByUser?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
