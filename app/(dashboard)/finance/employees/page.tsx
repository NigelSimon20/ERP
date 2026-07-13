'use client'

import { useState, useEffect } from 'react'
import { FaUsers } from 'react-icons/fa'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/utils'

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
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Total Headcount</p>
          <p className="text-2xl font-bold text-[#0D1B2A]">{summary.totalHeadcount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Payroll Cost YTD</p>
          <p className="text-2xl font-bold text-[#CC0000]">{formatCurrency(summary.totalPayrollCostYTD)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Total Hours YTD</p>
          <p className="text-2xl font-bold text-[#0D1B2A]">{summary.totalHoursYTD.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Avg Monthly Cost/Guard</p>
          <p className="text-2xl font-bold text-amber-600">{formatCurrency(summary.avgMonthlyCostPerEmployee)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-32 bg-gray-200 rounded" /><div className="h-3 flex-1 bg-gray-100 rounded" /><div className="h-3 w-20 bg-gray-200 rounded" /></div>)}</div>
        ) : employees.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaUsers} title="No active employees found" description="Guards need to be set up in the HR module to appear here" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Employee #</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Department</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Position</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">YTD Cost</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Last Payslip</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Hours YTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.employeeNumber}</td>
                  <td className="px-4 py-3 font-medium text-[#0D1B2A]">{e.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.department}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.position}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#CC0000]">{formatCurrency(e.ytdCost)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(e.lastPayslipAmount)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{e.totalHoursYTD}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
