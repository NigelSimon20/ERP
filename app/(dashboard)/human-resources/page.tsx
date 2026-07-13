'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FaUsers, FaDollarSign, FaCalendarAlt, FaClock, FaChartLine, FaExclamationCircle } from 'react-icons/fa'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency } from '@/lib/utils'

interface KpiData { totalActive: number; totalHeadcount: number; lastPayrollNet: number; lastPayrollDate: string | null; pendingLeave: number; avgHourlyRate: number; onLeaveToday: number; expiredContracts: number }

function KpiCard({ icon: Icon, label, value, sub, color = 'blue', href }: { icon: React.ElementType; label: string; value: string; sub?: string; color?: string; href: string }) {
  const iconColors: Record<string, string> = { blue: 'text-blue-600 bg-blue-50', red: 'text-[#CC0000] bg-red-50', green: 'text-green-600 bg-green-50', amber: 'text-amber-600 bg-amber-50', navy: 'text-[#0D1B2A] bg-gray-100' }
  return (
    <Link href={href} className="block rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`rounded-lg p-2 ${iconColors[color] ?? iconColors.blue}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#0D1B2A]">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Link>
  )
}

export default function HRDashboardPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/hr/employees').then(r => r.json()),
      fetch('/api/hr/payroll').then(r => r.json()),
      fetch('/api/hr/leave?status=PENDING').then(r => r.json()),
    ]).then(([emp, payroll, leave]) => {
      const guards: { status: string; hourlyRate: number }[] = emp.guards ?? []
      const activeGuards = guards.filter(g => g.status === 'ACTIVE')
      const runs: { runDate: string; totalNet: number }[] = payroll.runs ?? []
      const lastRun = runs[0]
      const avgRate = activeGuards.length ? activeGuards.reduce((s, g) => s + Number(g.hourlyRate), 0) / activeGuards.length : 0
      setKpi({
        totalActive: activeGuards.length,
        totalHeadcount: guards.length,
        lastPayrollNet: lastRun ? Number(lastRun.totalNet) : 0,
        lastPayrollDate: lastRun?.runDate ?? null,
        pendingLeave: (leave.leave ?? []).length,
        avgHourlyRate: avgRate,
        onLeaveToday: 0,
        expiredContracts: 0,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div>
        <PageHeader title="Human Resources" description="HR and payroll management dashboard" />
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-lg bg-gray-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Human Resources" description="HR and payroll management dashboard" />

      {kpi && (
        <>
          {kpi.pendingLeave > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
              <FaExclamationCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span><strong>{kpi.pendingLeave}</strong> pending leave {kpi.pendingLeave === 1 ? 'request requires' : 'requests require'} your attention.</span>
              <Link href="/human-resources/leave-management?status=PENDING" className="ml-auto text-amber-600 hover:underline font-medium text-xs">Review</Link>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard icon={FaUsers} label="Active Guards" value={String(kpi.totalActive)} sub={`${kpi.totalHeadcount} total headcount`} color="navy" href="/human-resources/employees" />
            <KpiCard icon={FaDollarSign} label="Last Payroll Net" value={formatCurrency(kpi.lastPayrollNet)} sub={kpi.lastPayrollDate ? new Date(kpi.lastPayrollDate).toLocaleDateString() : 'No runs yet'} color="green" href="/human-resources/payroll" />
            <KpiCard icon={FaCalendarAlt} label="Pending Leave" value={String(kpi.pendingLeave)} sub="Awaiting approval" color={kpi.pendingLeave > 0 ? 'amber' : 'blue'} href="/human-resources/leave-management" />
            <KpiCard icon={FaChartLine} label="Avg Hourly Rate" value={formatCurrency(kpi.avgHourlyRate)} sub="Per active guard" color="blue" href="/human-resources/employees" />
            <KpiCard icon={FaClock} label="Payslips" value="View All" sub="Filter by run or guard" color="navy" href="/human-resources/payslips" />
            <KpiCard icon={FaDollarSign} label="Payslip Items" value="Configure" sub="Earnings and deductions" color="red" href="/human-resources/payslip-items" />
          </div>
        </>
      )}
    </div>
  )
}
