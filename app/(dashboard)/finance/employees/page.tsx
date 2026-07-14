'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { PeopleRegular } from '@fluentui/react-icons';

interface EmployeeCostRow { id: string; name: string; employeeNumber: string; department: string; position: string; ytdCost: number; lastPayslipAmount: number; totalHoursYTD: number }
interface Summary { totalHeadcount: number; totalPayrollCostYTD: number; totalHoursYTD: number; avgMonthlyCostPerEmployee: number }

export default function FinanceEmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeCostRow[]>([])
  const [summary, setSummary] = useState<Summary>({ totalHeadcount: 0, totalPayrollCostYTD: 0, totalHoursYTD: 0, avgMonthlyCostPerEmployee: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance/employees').then(r => r.json()).then(json => {
      setEmployees(json.employees ?? [])
      setSummary({ totalHeadcount: json.totalHeadcount ?? 0, totalPayrollCostYTD: json.totalPayrollCostYTD ?? 0, totalHoursYTD: json.totalHoursYTD ?? 0, avgMonthlyCostPerEmployee: json.avgMonthlyCostPerEmployee ?? 0 })
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Employee Costs" description="Read-only view of payroll costs per employee (current fiscal year)" />

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Headcount</p>
          <p className="text-2xl font-bold text-foreground">{summary.totalHeadcount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Payroll Cost YTD</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(summary.totalPayrollCostYTD)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Hours YTD</p>
          <p className="text-2xl font-bold text-foreground">{summary.totalHoursYTD.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg Monthly Cost/Guard</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(summary.avgMonthlyCostPerEmployee)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-32 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /><div className="h-3 w-20 bg-muted rounded" /></div>)}</div>
        ) : employees.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No active employees found" description="Guards need to be set up in the HR module to appear here" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee #</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Department</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Position</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">YTD Cost</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Last Payslip</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Hours YTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.employeeNumber}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{e.department}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{e.position}</td>
                  <td className="px-4 py-3 text-right font-medium text-primary">{formatCurrency(e.ytdCost)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(e.lastPayslipAmount)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{e.totalHoursYTD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
