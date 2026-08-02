'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency } from '@/lib/utils'
import { ArrowTrendingRegular, CalendarLtrRegular, ClockRegular, ErrorCircleRegular, MoneyRegular, PeopleRegular } from '@fluentui/react-icons';

interface KpiData { totalActive: number; totalHeadcount: number; lastPayrollNet: number; lastPayrollDate: string | null; pendingLeave: number; avgDailyRate: number; onLeaveToday: number; expiredContracts: number }

function KpiCard({ icon: Icon, label, value, sub, color = 'blue', href }: { icon: React.ElementType; label: string; value: string; sub?: string; color?: string; href: string }) {
  const iconColors: Record<string, string> = { blue: 'text-blue-600 bg-blue-50', red: 'text-primary bg-red-50', green: 'text-green-600 bg-green-50', amber: 'text-amber-600 bg-amber-50', navy: 'text-foreground bg-muted' }
  return (
    <Link href={href} className="block rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`rounded-lg p-2 ${iconColors[color] ?? iconColors.blue}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-brand-muted-light mt-1">{sub}</p>}
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
      const guards: { status: string; dailyRate: number | null }[] = emp.guards ?? []
      const activeGuards = guards.filter(g => g.status === 'Active')
      const runs: { runDate: string; totalNet: number }[] = payroll.runs ?? []
      const lastRun = runs[0]
      const avgRate = activeGuards.length ? activeGuards.reduce((s, g) => s + Number(g.dailyRate ?? 0), 0) / activeGuards.length : 0
      setKpi({
        totalActive: activeGuards.length,
        totalHeadcount: guards.length,
        lastPayrollNet: lastRun ? Number(lastRun.totalNet) : 0,
        lastPayrollDate: lastRun?.runDate ?? null,
        pendingLeave: (leave.leave ?? []).length,
        avgDailyRate: avgRate,
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
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-lg bg-muted animate-pulse" />)}
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
              <ErrorCircleRegular className="h-4 w-4 text-amber-600 shrink-0" />
              <span><strong>{kpi.pendingLeave}</strong> pending leave {kpi.pendingLeave === 1 ? 'request requires' : 'requests require'} your attention.</span>
              <Link href="/human-resources/leave-management?status=PENDING" className="ml-auto text-amber-600 hover:underline font-medium text-xs">Review</Link>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard icon={PeopleRegular} label="Active Guards" value={String(kpi.totalActive)} sub={`${kpi.totalHeadcount} total headcount`} color="navy" href="/human-resources/employees" />
            <KpiCard icon={MoneyRegular} label="Last Payroll Net" value={formatCurrency(kpi.lastPayrollNet)} sub={kpi.lastPayrollDate ? new Date(kpi.lastPayrollDate).toLocaleDateString() : 'No runs yet'} color="green" href="/human-resources/payroll" />
            <KpiCard icon={CalendarLtrRegular} label="Pending Leave" value={String(kpi.pendingLeave)} sub="Awaiting approval" color={kpi.pendingLeave > 0 ? 'amber' : 'blue'} href="/human-resources/leave-management" />
            <KpiCard icon={ArrowTrendingRegular} label="Avg Daily Rate" value={formatCurrency(kpi.avgDailyRate)} sub="Per active guard" color="blue" href="/human-resources/employees" />
            <KpiCard icon={ClockRegular} label="Payslips" value="View All" sub="Filter by run or guard" color="navy" href="/human-resources/payslips" />
            <KpiCard icon={MoneyRegular} label="Payslip Items" value="Configure" sub="Earnings and deductions" color="red" href="/human-resources/payslip-items" />
          </div>
        </>
      )}
    </div>
  )
}
