'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { MdTrendingUp, MdAddCircle, MdEdit, MdDeleteForever, MdLogin, MdLogout, MdShowChart } from 'react-icons/md'
import { FaHandHoldingUsd, FaUserShield, FaHardHat, FaChartBar, FaExclamationTriangle } from 'react-icons/fa'
import { TbBuildingBank, TbBuildingSkyscraper, TbShieldExclamation } from 'react-icons/tb'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { SkeletonKPI, SkeletonChart, SkeletonTable } from '@/components/dashboard/SkeletonLoaders'
import { formatCurrency, timeAgo } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { SEVERITY_COLORS as THEME_SEVERITY_COLORS } from '@/lib/theme'

interface ExecData {
  totalRevenue: number
  outstandingReceivables: number
  cashInBank: number
  activeGuards: number
  activeSites: number
  openIncidents: number
  criticalIncidents: number
  guardsOnDutyToday: number
  pendingTasks: number
  overdueInvoices: number
  lastPayroll: { totalNet: number; periodStart: string; periodEnd: string } | null
  monthlyChart: { month: string; revenue: number; expenses: number }[]
  incidentsBySeverity: { severity: string; count: number }[]
  topSites: { name: string; revenue: number; guards: number; status: string }[]
  recentMdShowChart: { action: string; module: string; userName: string; createdAt: string; recordId: string | null }[]
}

const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
const SEVERITY_COLORS: Record<string, string> = THEME_SEVERITY_COLORS

const ACTION_ICON: Record<string, React.ElementType> = {
  CREATE: MdAddCircle,
  UPDATE: MdEdit,
  DELETE: MdDeleteForever,
  LOGIN: MdLogin,
  LOGOUT: MdLogout,
}
const ACTION_STYLE: Record<string, string> = {
  CREATE: 'bg-[#DCFCE7] text-[#16A34A]',
  UPDATE: 'bg-[#DBEAFE] text-[#1D4ED8]',
  DELETE: 'bg-[#FEE2E2] text-[#B91C1C]',
  LOGIN:  'bg-[#F3F4F6] text-[#6B7280]',
  LOGOUT: 'bg-[#F3F4F6] text-[#6B7280]',
}

const CHART_TICK = { fontSize: 11, fill: '#9CA3AF' }
const DASHBOARD_REFRESH_MS = 30_000

function fmtY(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

export default function ExecutiveDashboardPage() {
  const [data, setData] = useState<ExecData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async (initial = false) => {
      if (initial && mounted) {
        setLoading(true)
        setError(false)
      }

      try {
        const res = await fetch('/api/dashboard/executive', { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const json = await res.json()

        if (!mounted) return
        setData(json)
        setError(false)
      } catch {
        if (mounted && initial) setError(true)
      } finally {
        if (mounted && initial) setLoading(false)
      }
    }

    void loadDashboard(true)
    const refreshId = setInterval(() => {
      void loadDashboard(false)
    }, DASHBOARD_REFRESH_MS)

    return () => {
      mounted = false
      clearInterval(refreshId)
    }
  }, [])

  if (error) return (
    <DashboardPageShell title="Executive Dashboard" subtitle="Company-wide overview">
      <div className="erp-card text-center py-16">
        <p className="text-sm text-[#EF4444] font-medium">Failed to load dashboard data.</p>
        <p className="text-xs text-[#9CA3AF] mt-1">Please refresh the page to try again.</p>
      </div>
    </DashboardPageShell>
  )

  return (
    <DashboardPageShell title="Executive Dashboard" subtitle="Company-wide performance overview">
      <div className="space-y-6 animate-fade-in">

        {/* ── Financial KPIs ── */}
        {loading ? <SkeletonKPI count={3} cols={3} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard title="Total Revenue" subtitle="Fiscal year to date" value={formatCurrency(data?.totalRevenue ?? 0)} icon={MdTrendingUp} color="red" />
            <KPICard title="Outstanding Receivables" subtitle="Awaiting collection" value={formatCurrency(data?.outstandingReceivables ?? 0)} icon={FaHandHoldingUsd} color="amber" />
            <KPICard title="Cash in Bank" subtitle="Available balance" value={formatCurrency(data?.cashInBank ?? 0)} icon={TbBuildingBank} color="blue" />
          </div>
        )}

        {/* ── Operational KPIs ── */}
        {loading ? <SkeletonKPI count={4} cols={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPICard title="Active Guards" value={data?.activeGuards ?? 0} icon={FaUserShield} color="navy" />
            <KPICard title="Active Sites" value={data?.activeSites ?? 0} icon={TbBuildingSkyscraper} color="blue" />
            <KPICard title="Open Incidents" value={data?.openIncidents ?? 0} icon={TbShieldExclamation} color={(data?.openIncidents ?? 0) > 0 ? 'amber' : 'green'} />
            <KPICard title="Guards on Duty" subtitle="Today" value={data?.guardsOnDutyToday ?? 0} icon={FaHardHat} color="red" />
          </div>
        )}

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <><SkeletonChart /><SkeletonChart /></>
          ) : (
            <>
              <ChartCard title="Revenue vs Expenses" subtitle="Last 6 months">
                {!data?.monthlyChart?.length || !data?.monthlyChart?.some(m => m.revenue > 0 || m.expenses > 0) ? (
                  <EmptyState icon={FaChartBar} title="No financial data yet" description="Record receipts and payments to see trends" />
                ) : (
                  <ResponsiveContainer width="100%" height={224}>
                    <BarChart data={data.monthlyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="month" tick={CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtY} tick={CHART_TICK} axisLine={false} tickLine={false} width={52} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0))} contentStyle={CT} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="revenue" name="Revenue" fill="#E74C5B" radius={[5,5,0,0]} maxBarSize={32} />
                      <Bar dataKey="expenses" name="Expenses" fill="#E5E7EB" radius={[5,5,0,0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Incidents by Severity" subtitle="Current period">
                {!data?.incidentsBySeverity?.length ? (
                  <EmptyState icon={FaExclamationTriangle} title="No incidents recorded" description="Incidents will appear here once logged" />
                ) : (
                  <ResponsiveContainer width="100%" height={224}>
                    <PieChart>
                      <Pie data={data.incidentsBySeverity} dataKey="count" nameKey="severity"
                        cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3}>
                        {data.incidentsBySeverity.map(e => (
                          <Cell key={e.severity} fill={SEVERITY_COLORS[e.severity] ?? '#9CA3AF'} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any, name: any) => [value, name]} contentStyle={CT} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </>
          )}
        </div>

        {/* ── Tables ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <><SkeletonTable rows={5} /><SkeletonTable rows={5} /></>
          ) : (
            <>
              {/* Top Sites */}
              <div className="erp-card !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E5E7EB]">
                  <p className="text-sm font-semibold text-[#1F2937]">Top 5 Sites by Contract Value</p>
                </div>
                {!data?.topSites?.length ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-[#9CA3AF]">No sites found</p>
                  </div>
                ) : (
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <th>Site</th>
                        <th className="text-right">Contract Value</th>
                        <th className="text-right">Guards</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.topSites?.map(s => (
                        <tr key={s.name}>
                          <td className="font-medium text-[#1F2937] truncate max-w-[160px]">{s.name}</td>
                          <td className="text-right text-[#6B7280]">{formatCurrency(s.revenue)}</td>
                          <td className="text-right text-[#6B7280]">{s.guards}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Recent Activity */}
              <div className="erp-card !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E5E7EB]">
                  <p className="text-sm font-semibold text-[#1F2937]">Recent Activity</p>
                </div>
                {!data?.recentMdShowChart?.length ? (
                  <div className="px-5 py-8">
                    <EmptyState icon={MdShowChart} title="No activity yet" description="System actions will appear here" />
                  </div>
                ) : (
                  <ul className="divide-y divide-[#F3F4F6] px-5">
                    {data?.recentMdShowChart?.map((item, idx) => {
                      const Icon = ACTION_ICON[item.action] ?? MdShowChart
                      const style = ACTION_STYLE[item.action] ?? 'bg-[#F3F4F6] text-[#6B7280]'
                      return (
                        <li key={idx} className="flex items-center gap-3 py-3 first:pt-4 last:pb-4">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm ${style}`}>
                            <Icon size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[#374151] truncate">
                              <span className="font-semibold">{item.userName}</span>
                              <span className="text-[#9CA3AF]"> · {item.module}</span>
                            </p>
                            <p className="text-xs text-[#9CA3AF] mt-0.5">{timeAgo(item.createdAt)}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardPageShell>
  )
}


