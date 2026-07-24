'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { AddCircleRegular, ArrowDownloadRegular, ArrowEnterRegular, ArrowTrendingRegular, ArrowUploadRegular, BuildingBankRegular, BuildingRegular, DataBarVerticalRegular, DeleteRegular, DocumentRegular, EditRegular, MoneyHandRegular, PersonRegular, ShieldErrorRegular, ShieldPersonRegular, SignOutRegular, WarningRegular } from '@fluentui/react-icons';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { SkeletonKPI, SkeletonChart, SkeletonTable } from '@/components/dashboard/SkeletonLoaders'
import { formatCurrency, timeAgo } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { SEVERITY_COLORS as THEME_SEVERITY_COLORS } from '@/lib/theme'

interface ExecData {
  reportingCurrency: string
  viewCurrency: string
  availableCurrencies: string[]
  excludedCount: number
  totalRevenue: number
  outstandingReceivables: number
  totalExpenses: number
  cashIn: number
  cashInBank: number
  pettyCash: number
  totalBankAccounts: number
  ratios: { workingCapital: number; currentRatio: number | null }
  contractRevenue: { totalActiveValue: number; activeCount: number }
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
  recentActivity: { action: string; module: string; userName: string; createdAt: string; recordId: string | null }[]
}

const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
const SEVERITY_COLORS: Record<string, string> = THEME_SEVERITY_COLORS

const ACTION_ICON: Record<string, React.ElementType> = {
  CREATE: AddCircleRegular,
  UPDATE: EditRegular,
  DELETE: DeleteRegular,
  LOGIN: ArrowEnterRegular,
  LOGOUT: SignOutRegular,
}
const ACTION_STYLE: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  DELETE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  LOGIN:  'bg-border text-muted-foreground',
  LOGOUT: 'bg-border text-muted-foreground',
}

const CHART_TICK = { fontSize: 11, fill: '#9CA3AF' }
const DASHBOARD_REFRESH_MS = 30_000

function fmtY(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function fmtRatio(v: number | null) {
  return v === null ? 'N/A' : v.toFixed(2)
}

export default function ExecutiveDashboardPage() {
  const [data, setData] = useState<ExecData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [currency, setCurrency] = useState<string | null>(null) // null = reporting currency (default)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async (initial = false) => {
      if (initial && mounted) {
        setLoading(true)
        setError(false)
      }

      try {
        const url = currency ? `/api/dashboard/executive?currency=${encodeURIComponent(currency)}` : '/api/dashboard/executive'
        const res = await fetch(url, { cache: 'no-store' })
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
  }, [currency])

  if (error) return (
    <DashboardPageShell title="Executive Dashboard" subtitle="Company-wide overview">
      <div className="erp-card text-center py-16">
        <p className="text-sm text-primary font-medium">Failed to load dashboard data.</p>
        <p className="text-xs text-brand-muted-light mt-1">Please refresh the page to try again.</p>
      </div>
    </DashboardPageShell>
  )

  const vc = data?.viewCurrency || 'USD'
  const isNativeView = !!data && data.viewCurrency !== data.reportingCurrency

  return (
    <DashboardPageShell title="Executive Dashboard" subtitle="Company-wide performance overview">
      <div className="space-y-6 animate-fade-in">

        {data && data.availableCurrencies.length > 1 && (
          <div className="flex justify-end">
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              {data.availableCurrencies.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c === data.reportingCurrency ? null : c)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${vc === c ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  {c}{c === data.reportingCurrency ? ' (Reporting)' : ' (Native)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {isNativeView && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            Showing <strong>{vc}</strong>-denominated transactions only, at face value with no currency conversion. Figures below will not match the {data!.reportingCurrency} view.
          </div>
        )}
        {!isNativeView && (data?.excludedCount ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            {data!.excludedCount} transaction{data!.excludedCount === 1 ? '' : 's'} in a currency with no exchange rate on file were excluded from these {data!.reportingCurrency} totals rather than added unconverted. Use the currency toggle above to view them at face value.
          </div>
        )}

        {/* ── Financial KPIs ── */}
        {loading ? <SkeletonKPI count={3} cols={3} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard title="Total Revenue" subtitle="Fiscal year to date" value={formatCurrency(data?.totalRevenue ?? 0, vc)} icon={ArrowTrendingRegular} color="red" />
            <KPICard title="Outstanding Receivables" subtitle="Awaiting collection" value={formatCurrency(data?.outstandingReceivables ?? 0, vc)} icon={MoneyHandRegular} color="amber" />
            <KPICard title="Cash in Bank" subtitle="Available balance" value={formatCurrency(data?.cashInBank ?? 0, vc)} icon={BuildingBankRegular} color="blue" />
          </div>
        )}

        {/* ── Cash Position ── */}
        {loading ? <SkeletonKPI count={4} cols={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPICard title="Total Bank Accounts" value={data?.totalBankAccounts ?? 0} icon={BuildingBankRegular} color="navy" />
            <KPICard title="Cash In" subtitle="Last 6 months" value={formatCurrency(data?.cashIn ?? 0, vc)} icon={ArrowDownloadRegular} color="green" />
            <KPICard title="Cash Out" subtitle="Last 6 months" value={formatCurrency(data?.totalExpenses ?? 0, vc)} icon={ArrowUploadRegular} color="amber" />
            <KPICard title="Petty Cash" subtitle="Included in Cash in Bank" value={formatCurrency(data?.pettyCash ?? 0, vc)} icon={MoneyHandRegular} color="white" />
          </div>
        )}

        {/* ── Financial Ratios (GL basis) ── */}
        {loading ? <SkeletonKPI count={2} cols={2} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KPICard title="Working Capital" subtitle="GL basis" value={formatCurrency(data?.ratios.workingCapital ?? 0, vc)} icon={ArrowTrendingRegular} color={(data?.ratios.workingCapital ?? 0) >= 0 ? 'green' : 'red'} />
            <KPICard title="Current Ratio" subtitle="GL basis" value={fmtRatio(data?.ratios.currentRatio ?? null)} icon={DataBarVerticalRegular} color={(data?.ratios.currentRatio ?? 0) < 1 ? 'amber' : 'green'} />
          </div>
        )}

        {/* ── Operational KPIs ── */}
        {loading ? <SkeletonKPI count={4} cols={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KPICard title="Active Guards" value={data?.activeGuards ?? 0} icon={ShieldPersonRegular} color="navy" />
            <KPICard title="Active Sites" value={data?.activeSites ?? 0} icon={BuildingRegular} color="blue" />
            <KPICard title="Open Incidents" value={data?.openIncidents ?? 0} icon={ShieldErrorRegular} color={(data?.openIncidents ?? 0) > 0 ? 'amber' : 'green'} />
            <KPICard title="Guards on Duty" subtitle="Today" value={data?.guardsOnDutyToday ?? 0} icon={PersonRegular} color="red" />
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
                  <EmptyState icon={DataBarVerticalRegular} title="No financial data yet" description="Record receipts and payments to see trends" />
                ) : (
                  <ResponsiveContainer width="100%" height={224}>
                    <BarChart data={data.monthlyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="month" tick={CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={fmtY} tick={CHART_TICK} axisLine={false} tickLine={false} width={52} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0), vc)} contentStyle={CT} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="revenue" name="Revenue" fill="#DC2626" radius={[5,5,0,0]} maxBarSize={32} />
                      <Bar dataKey="expenses" name="Expenses" fill="#E5E7EB" radius={[5,5,0,0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Incidents by Severity" subtitle="Current period">
                {!data?.incidentsBySeverity?.length ? (
                  <EmptyState icon={WarningRegular} title="No incidents recorded" description="Incidents will appear here once logged" />
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

        {/* ── Contract Revenue ── */}
        {loading ? <SkeletonKPI count={2} cols={2} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KPICard title="Total Active Contract Value" subtitle="Real contracts, not the site estimate below" value={formatCurrency(data?.contractRevenue.totalActiveValue ?? 0, vc)} icon={DocumentRegular} color="navy" />
            <KPICard title="Active Contracts" value={data?.contractRevenue.activeCount ?? 0} icon={DocumentRegular} color="blue" />
          </div>
        )}

        {/* ── Tables ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <><SkeletonTable rows={5} /><SkeletonTable rows={5} /></>
          ) : (
            <>
              {/* Top Sites */}
              <div className="erp-card !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Top 5 Sites by Contract Value</p>
                </div>
                {!data?.topSites?.length ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-brand-muted-light">No sites found</p>
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
                          <td className="font-medium text-foreground truncate max-w-[160px]">{s.name}</td>
                          <td className="text-right text-muted-foreground">{formatCurrency(s.revenue)}</td>
                          <td className="text-right text-muted-foreground">{s.guards}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Recent Activity */}
              <div className="erp-card !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <p className="text-sm font-semibold text-foreground">Recent Activity</p>
                </div>
                {!data?.recentActivity?.length ? (
                  <div className="px-5 py-8">
                    <EmptyState icon={ArrowTrendingRegular} title="No activity yet" description="System actions will appear here" />
                  </div>
                ) : (
                  <ul className="divide-y divide-border px-5">
                    {data?.recentActivity?.map((item, idx) => {
                      const Icon = ACTION_ICON[item.action] ?? ArrowTrendingRegular
                      const style = ACTION_STYLE[item.action] ?? 'bg-border text-muted-foreground'
                      return (
                        <li key={idx} className="flex items-center gap-3 py-3 first:pt-4 last:pb-4">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm ${style}`}>
                            <Icon size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground truncate">
                              <span className="font-semibold">{item.userName}</span>
                              <span className="text-brand-muted-light"> · {item.module}</span>
                            </p>
                            <p className="text-xs text-brand-muted-light mt-0.5">{timeAgo(item.createdAt)}</p>
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


