'use client'

import { useState, useEffect } from 'react'
import { FaUsers, FaDollarSign, FaChartLine, FaCalendar } from 'react-icons/fa'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'

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
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1"><FaCalendar className="h-4 w-4 text-gray-400" /><p className="text-xs text-gray-500">This Month</p></div>
          <p className="text-xl font-bold text-[#CC0000]">{formatCurrency(summary.thisMonthTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1"><FaChartLine className="h-4 w-4 text-gray-400" /><p className="text-xs text-gray-500">Year-to-Date</p></div>
          <p className="text-xl font-bold text-[#0D1B2A]">{formatCurrency(summary.thisYearTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1"><FaDollarSign className="h-4 w-4 text-gray-400" /><p className="text-xs text-gray-500">Avg Net Pay/Guard</p></div>
          <p className="text-xl font-bold text-amber-600">{formatCurrency(summary.avgNetPayPerGuard)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1"><FaUsers className="h-4 w-4 text-gray-400" /><p className="text-xs text-gray-500">Guards (Last Run)</p></div>
          <p className="text-xl font-bold text-[#0D1B2A]">{summary.guardsOnLastRun}</p>
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

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-24 bg-gray-200 rounded" /><div className="h-3 flex-1 bg-gray-100 rounded" /></div>)}</div>
        ) : runs.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaUsers} title="No payroll runs found" description="Payroll runs are managed from the HR Payroll module" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Run Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Period</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Guards</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Gross</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Deductions</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Net Pay</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Bank</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Processed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{formatDate(new Date(r.runDate))}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(new Date(r.payPeriodStart))} – {formatDate(new Date(r.payPeriodEnd))}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.payslipCount}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(Number(r.totalGross))}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatCurrency(Number(r.totalDeductions))}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#0D1B2A]">{formatCurrency(Number(r.totalNet))}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.bankAccount?.bankName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : r.status === 'PROCESSING' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.processedByUser?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
