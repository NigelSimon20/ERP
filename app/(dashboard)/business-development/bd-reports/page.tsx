'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { STAGE_COLORS as THEME_STAGE_COLORS, PIE_COLORS as THEME_PIE_COLORS } from '@/lib/theme'
import { formatCurrency } from '@/lib/utils'

interface Lead { status: string; estimatedValue: number | null; probability: number; createdAt: string }
interface Quotation { status: string }
interface Invoice { customerId: string; totalAmount: number; customer: { name: string } | null }

const STAGE_ORDER = ['INQUIRY', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD']
const STAGE_COLORS: Record<string, string> = THEME_STAGE_COLORS
const PIE_COLORS = THEME_PIE_COLORS

function EmptyChart() {
  return <div className="h-48 flex items-center justify-center text-sm text-brand-muted-light">No data for selected period</div>
}

function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  )
}

function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case '7d': return new Date(now.setDate(now.getDate() - 7))
    case '30d': return new Date(now.setDate(now.getDate() - 30))
    case '90d': return new Date(now.setDate(now.getDate() - 90))
    case 'ytd': return new Date(new Date().getFullYear(), 0, 1)
    default: return new Date(0)
  }
}

export default function BdReportsPage() {
  const [period, setPeriod] = useState('30d')
  const [leads, setLeads] = useState<Lead[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/bd/leads').then(r => r.json()),
      fetch('/api/bd/quotations').then(r => r.json()),
      fetch('/api/bd/revenue-by-customer').then(r => r.json()),
    ]).then(([l, q, inv]) => {
      setLeads(l.leads ?? [])
      setQuotations(q.quotations ?? [])
      setInvoices(inv.invoices ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const periodStart = getPeriodStart(period)
  const periodLeads = leads.filter(l => new Date(l.createdAt) >= periodStart)

  // 1. Pipeline by Stage
  const pipelineByStage = STAGE_ORDER.map(stage => {
    const stageLeads = periodLeads.filter(l => l.status === stage)
    return { stage, count: stageLeads.length, value: stageLeads.reduce((s, l) => s + Number(l.estimatedValue ?? 0), 0) }
  }).filter(s => s.count > 0)

  // 2. Won vs Lost
  const wonCount = periodLeads.filter(l => l.status === 'WON').length
  const lostCount = periodLeads.filter(l => l.status === 'LOST').length
  const wonLostData = [{ name: 'Won', value: wonCount }, { name: 'Lost', value: lostCount }].filter(d => d.value > 0)

  // 3. Revenue by Customer (top 10 from invoices)
  const revenueByCustomer: Record<string, { name: string; revenue: number }> = {}
  for (const inv of invoices) {
    if (!inv.customerId || !inv.customer) continue
    if (!revenueByCustomer[inv.customerId]) revenueByCustomer[inv.customerId] = { name: inv.customer.name, revenue: 0 }
    revenueByCustomer[inv.customerId].revenue += Number(inv.totalAmount)
  }
  const topCustomers = Object.values(revenueByCustomer).sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // 4. Quote Conversion Rate
  const totalQuotes = quotations.length
  const acceptedQuotes = quotations.filter(q => ['ACCEPTED', 'CONVERTED'].includes(q.status)).length
  const conversionRate = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0

  if (loading) {
    return (
      <div>
        <PageHeader title="BD Reports" description="Pipeline and performance analytics" />
        <div className="mt-6 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="BD Reports" description="Pipeline and performance analytics" />

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Period:</span>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 1. Pipeline by Stage */}
        <ReportCard title="Pipeline by Stage">
          {pipelineByStage.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pipelineByStage} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value, name) => name === 'value' ? formatCurrency(Number(value)) : value} labelFormatter={l => l} />
                <Bar yAxisId="left" dataKey="count" name="Leads" fill="#111827" radius={[3, 3, 0, 0]}>
                  {pipelineByStage.map((entry) => <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? '#9CA3AF'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ReportCard>

        {/* 2. Won vs Lost */}
        <ReportCard title="Won vs Lost">
          {wonLostData.length === 0 ? <EmptyChart /> : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie data={wonLostData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                    {wonLostData.map((entry, i) => <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                <div><p className="text-2xl font-bold text-green-600 dark:text-green-400">{wonCount}</p><p className="text-xs text-brand-muted-light">Won</p></div>
                <div><p className="text-2xl font-bold text-primary">{lostCount}</p><p className="text-xs text-brand-muted-light">Lost</p></div>
                {wonCount + lostCount > 0 && <div><p className="text-lg font-semibold text-foreground">{Math.round(wonCount / (wonCount + lostCount) * 100)}%</p><p className="text-xs text-brand-muted-light">Win Rate</p></div>}
              </div>
            </div>
          )}
        </ReportCard>

        {/* 3. Revenue by Customer */}
        <ReportCard title="Revenue by Customer (Top 10)">
          {topCustomers.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCustomers} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={v => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" name="Revenue" fill="#DC2626" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ReportCard>

        {/* 4. Quote Conversion Rate */}
        <ReportCard title="Quote Conversion Rate">
          {totalQuotes === 0 ? <EmptyChart /> : (
            <div className="flex items-center gap-6">
              <div className="relative flex items-center justify-center w-32 h-32 shrink-0">
                <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E5E7EB" strokeWidth="3.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#DC2626" strokeWidth="3.5" strokeDasharray={`${conversionRate} ${100 - conversionRate}`} strokeLinecap="round" />
                </svg>
                <span className="absolute text-2xl font-bold text-primary">{conversionRate}%</span>
              </div>
              <div className="space-y-3 text-sm">
                <div><p className="text-lg font-bold text-foreground">{totalQuotes}</p><p className="text-xs text-brand-muted-light">Total Quotes</p></div>
                <div><p className="text-lg font-bold text-green-600">{acceptedQuotes}</p><p className="text-xs text-brand-muted-light">Accepted</p></div>
                <div><p className="text-lg font-bold text-brand-muted-light">{totalQuotes - acceptedQuotes}</p><p className="text-xs text-brand-muted-light">Not accepted</p></div>
              </div>
            </div>
          )}
        </ReportCard>
      </div>
    </div>
  )
}
