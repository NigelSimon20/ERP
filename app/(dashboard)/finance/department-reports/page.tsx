'use client'

import { useState } from 'react'
import { FaChartBar, FaDownload } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface DeptReport {
  department: string
  period: string
  totalRevenue: number
  totalExpenses: number
  netContribution: number
  headcount: number
  payrollCost: number
  payrollPct: number
  lineItems: { category: string; amount: number }[]
}

const DEPARTMENTS = ['All', 'Operations', 'Administration', 'HR', 'Finance', 'Sales', 'IT']

export default function DepartmentReportsPage() {
  const [department, setDepartment] = useState('All')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(0, 1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DeptReport | null>(null)

  async function generate() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ department, startDate, endDate })
      const res = await fetch(`/api/finance/reports/department?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Report generation failed'); setResult(null); return }
      setResult(json.report ?? json)
    } catch {
      toast.error('Network error generating report')
      setResult(null)
    } finally { setLoading(false) }
  }

  function downloadCSV() {
    if (!result) return
    const lines = [
      `"Department Report: ${result.department}"`,
      `"Period: ${result.period}"`,
      `"Revenue","${result.totalRevenue}"`,
      `"Expenses","${result.totalExpenses}"`,
      `"Net Contribution","${result.netContribution}"`,
      `"Headcount","${result.headcount}"`,
      `"Payroll Cost","${result.payrollCost}"`,
      '',
      '"Category","Amount"',
      ...(result.lineItems ?? []).map(l => `"${l.category}","${l.amount}"`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dept-report-${department}.csv`; a.click()
  }

  return (
    <div>
      <PageHeader title="Department Reports" description="Financial performance breakdown by department" />

      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select value={department} onValueChange={(v) => { setDepartment(v); setResult(null) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={generate} disabled={loading} className="bg-[#CC0000] hover:bg-[#AA0000] text-white flex-1">
              {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Loading…</> : <><FaChartBar className="h-4 w-4 mr-2" />Generate</>}
            </Button>
            {result && <Button type="button" variant="outline" onClick={downloadCSV} aria-label="Download CSV"><FaDownload className="h-4 w-4" /></Button>}
          </div>
        </div>
      </div>

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-[#0D1B2A]">{result.department} — {result.period}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                <p className="text-xs text-gray-500 mb-0.5">Total Revenue</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(result.totalRevenue)}</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-xs text-gray-500 mb-0.5">Total Expenses</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(result.totalExpenses)}</p>
              </div>
              <div className={`rounded-lg border p-3 ${result.netContribution >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                <p className="text-xs text-gray-500 mb-0.5">Net Contribution</p>
                <p className={`text-lg font-bold ${result.netContribution >= 0 ? 'text-[#0D1B2A]' : 'text-amber-600'}`}>{formatCurrency(result.netContribution)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-500 mb-0.5">Headcount</p>
                <p className="text-lg font-bold text-[#0D1B2A]">{result.headcount}</p>
                <p className="text-xs text-gray-400">Payroll: {formatCurrency(result.payrollCost)} ({result.payrollPct.toFixed(1)}%)</p>
              </div>
            </div>
          </div>

          {(result.lineItems ?? []).length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-[#0D1B2A]">Expense Breakdown</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">Category</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.lineItems.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">{item.category}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                        {result.totalExpenses > 0 ? ((item.amount / result.totalExpenses) * 100).toFixed(1) : '0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
