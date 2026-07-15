'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
// theme stage colors are available via the default import below
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { ArrowTrendingRegular, BriefcaseRegular, BuildingRegular, ChartMultipleRegular, CheckmarkCircleRegular, DataBarVerticalRegular, DismissCircleRegular, PeopleRegular, TextQuoteRegular } from '@fluentui/react-icons';

const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
import Link from 'next/link'

interface BDData {
  totalLeads: number
  activeLeads: number
  wonThisMonth: number
  lostThisMonth: number
  pipelineValue: number
  pendingQuotations: number
  quoteConversionRate: number
  totalCustomers: number
  totalContractValue: number
  leadsPerStage: { status: string; count: number }[]
  wonTrend: { month: string; count: number }[]
  recentLeads: { id: string; companyName: string; contactName: string; estimatedValue: number; status: string; createdAt: string }[]
  quotationsDueSoon: { quoteNumber: string; customerName: string; total: number; validUntil: string }[]
  revenueByCustomer: { name: string; amount: number }[]
}
const DASHBOARD_REFRESH_MS = 30_000

// Real per-stage classes (matches the LeadStatus enum) — chart fill colors
// live separately in lib/theme.ts's STAGE_COLORS (hex, for Recharts), this
// is the Tailwind-class equivalent for badges.
const STAGE_COLORS: Record<string, string> = {
  NEW: 'bg-muted text-muted-foreground',
  CONTACTED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  QUALIFIED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  NEGOTIATION: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  WON: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  LOST: 'bg-muted text-muted-foreground',
}

export default function BDDashboardPage() {
  const [data, setData] = useState<BDData | null>(null)
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
        const res = await fetch('/api/dashboard/bd', { cache: 'no-store' })
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
    <DashboardPageShell title="Business Development Dashboard" subtitle="Pipeline & customers">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load dashboard data.</p>
    </DashboardPageShell>
  )

  const now = new Date()
  const threeDaysOut = new Date(now.getTime() + 3 * 86_400_000)

  return (
    <DashboardPageShell title="Business Development Dashboard" subtitle="Pipeline, quotations & customer growth">
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Add Lead', href: '/business-development/leads', Icon: PeopleRegular },
            { label: 'Create Quote', href: '/business-development/quotations', Icon: TextQuoteRegular },
            { label: 'Customers', href: '/business-development/customers', Icon: BuildingRegular },
            { label: 'BD Reports', href: '/business-development/bd-reports', Icon: ChartMultipleRegular },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 px-3 py-1.5 erp-btn erp-btn-ghost erp-btn-sm">
              <Icon fontSize={13} /> {label}
            </Link>
          ))}
        </div>

        {/* Row 1 — Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Pipeline Value" value={formatCurrency(data!.pipelineValue)} icon={ArrowTrendingRegular} color="red" />
            <KPICard title="Active Leads" value={data!.activeLeads} icon={PeopleRegular} color="navy" />
            <KPICard title="Won This Month" value={data!.wonThisMonth} icon={CheckmarkCircleRegular} color="green" />
            <KPICard title="Lost This Month" value={data!.lostThisMonth} icon={DismissCircleRegular} color={data!.lostThisMonth > 0 ? 'amber' : 'white'} />
          </>}
        </div>

        {/* Row 2 — Quotations & Clients */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Total Customers" value={data!.totalCustomers} icon={BuildingRegular} color="white" />
            <KPICard title="Pending Quotes" value={data!.pendingQuotations} icon={TextQuoteRegular} color={data!.pendingQuotations > 0 ? 'amber' : 'white'} />
            <KPICard title="Conversion Rate" value={`${data!.quoteConversionRate}%`} icon={ChartMultipleRegular} color="white" />
            <KPICard title="Contract Value" subtitle="Active sites" value={formatCurrency(data!.totalContractValue)} icon={BriefcaseRegular} color="white" />
          </>}
        </div>

        {/* Row 3 — Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline by Stage</h3>
            {loading ? <div className="h-52 bg-border rounded-xl animate-pulse" /> :
              !data?.leadsPerStage.length ?
              <EmptyState icon={DataBarVerticalRegular} title="No leads yet" description="Add leads to see pipeline data" /> :
              <ResponsiveContainer width="100%" height={208}>
                <BarChart data={data!.leadsPerStage} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="status" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CT} />
                  <Bar dataKey="count" name="Leads" fill="#DC2626" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>

          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Won Leads Trend — Last 6 Months</h3>
            {loading ? <div className="h-52 bg-border rounded-xl animate-pulse" /> :
              <ResponsiveContainer width="100%" height={208}>
                <LineChart data={data?.wonTrend ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CT} />
                  <Line type="monotone" dataKey="count" name="Won Deals" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Row 4 — Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent Leads</h3>
            {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
              !data?.recentLeads.length ?
              <p className="text-sm text-brand-muted-light text-center py-6">No leads yet</p> :
              <div className="space-y-2">
                {data!.recentLeads.map(l => (
                  <div key={l.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{l.companyName}</p>
                      <p className="text-[10px] text-muted-foreground">{l.contactName} · {formatCurrency(l.estimatedValue)}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${STAGE_COLORS[l.status] ?? 'bg-muted text-muted-foreground'}`}>{l.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            }
          </div>

          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quotes Expiring Soon</h3>
            {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
              !data?.quotationsDueSoon.length ?
              <p className="text-sm text-brand-muted-light text-center py-6">No quotes expiring soon</p> :
              <div className="space-y-2">
                {data!.quotationsDueSoon.map(q => {
                  const urgent = new Date(q.validUntil) <= threeDaysOut
                  return (
                    <div key={q.quoteNumber} className={`flex items-center gap-3 py-2 border-b border-border last:border-0 rounded ${urgent ? 'bg-red-50 -mx-2 px-2' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground font-mono">{q.quoteNumber}</p>
                        <p className="text-[10px] text-muted-foreground">{q.customerName} · Expires {formatDate(q.validUntil)}</p>
                      </div>
                      <p className={`text-xs font-semibold shrink-0 ${urgent ? 'text-red-600' : 'text-foreground'}`}>{formatCurrency(q.total)}</p>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>

        {/* Row 5 — Revenue by Customer */}
        {!loading && data?.revenueByCustomer.some(c => c.amount > 0) && (
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Top Customers by Outstanding</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data!.revenueByCustomer} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={120} />
                <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0))} contentStyle={CT} />
                <Bar dataKey="amount" name="Outstanding" fill="#374151" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </DashboardPageShell>
  )
}




