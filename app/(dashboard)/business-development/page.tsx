'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { ArrowRightRegular, ArrowTrendingRegular, DataBarVerticalRegular, DocumentRegular, PeopleRegular, TargetArrowRegular } from '@fluentui/react-icons';

interface KpiCard { title: string; value: string; sub: string; href: string; icon: React.ElementType; color: string }

function KpiCard({ title, value, sub, href, icon: Icon, color }: KpiCard) {
  return (
    <Link href={href} className="block rounded-lg border border-border bg-card p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
        <ArrowRightRegular className="h-4 w-4 text-brand-muted-light group-hover:text-muted-foreground transition-colors mt-1" />
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm font-medium text-muted-foreground mt-0.5">{title}</p>
      <p className="text-xs text-brand-muted-light mt-1">{sub}</p>
    </Link>
  )
}

interface LeadStageRow { stage: string; count: number; value: number }

const STAGE_FILLS: Record<string, string> = { INQUIRY: '#818cf8', QUALIFIED: '#38bdf8', PROPOSAL: '#fbbf24', NEGOTIATION: '#fb923c', WON: '#4ade80', LOST: '#f87171', ON_HOLD: '#94a3b8' }
const STAGE_LABELS: Record<string, string> = { INQUIRY: 'Inquiry', QUALIFIED: 'Qualified', PROPOSAL: 'Proposal', NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost', ON_HOLD: 'On Hold' }
const STAGE_ORDER = ['INQUIRY', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD']

export default function BdDashboard() {
  const [data, setData] = useState<{
    leads: { id: string; status: string; estimatedValue: number | null; probability: number }[]
    customers: { id: string }[]
    quotations: { id: string; status: string; totalAmount: number }[]
    pipelineValue: number
    totalPipeline: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/bd/leads').then(r => r.json()),
      fetch('/api/bd/customers').then(r => r.json()),
      fetch('/api/bd/quotations').then(r => r.json()),
    ]).then(([l, c, q]) => {
      setData({ leads: l.leads ?? [], customers: c.customers ?? [], quotations: q.quotations ?? [], pipelineValue: l.pipelineValue ?? 0, totalPipeline: l.totalPipeline ?? 0 })
      setLoading(false)
    })
  }, [])

  const openLeads = data?.leads.filter(l => !['WON', 'LOST'].includes(l.status)) ?? []
  const pendingQuotes = data?.quotations.filter(q => ['DRAFT', 'SENT'].includes(q.status)) ?? []
  const wonLeads = data?.leads.filter(l => l.status === 'WON').length ?? 0
  const totalClosed = (data?.leads.filter(l => ['WON', 'LOST'].includes(l.status)).length ?? 0)
  const winRate = totalClosed > 0 ? Math.round((wonLeads / totalClosed) * 100) : 0

  const byStage: LeadStageRow[] = STAGE_ORDER.map(stage => ({
    stage,
    count: openLeads.filter(l => l.status === stage).length,
    value: openLeads.filter(l => l.status === stage).reduce((s, l) => s + Number(l.estimatedValue ?? 0), 0),
  })).filter(r => r.count > 0)

  const maxCount = Math.max(...byStage.map(r => r.count), 1)

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-foreground">Business Development</h1>
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Business Development</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pipeline overview</p>
        </div>
        <Link href="/business-development/bd-reports" className="text-sm text-primary hover:underline flex items-center gap-1"><DataBarVerticalRegular className="h-4 w-4" /> View Reports</Link>
      </div>

      {/* KPI Cards */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Open Leads" value={String(openLeads.length)} sub="Active in pipeline" href="/business-development/leads" icon={TargetArrowRegular} color="bg-primary/10 text-primary" />
        <KpiCard title="Pipeline Value" value={formatCurrency(data?.totalPipeline ?? 0)} sub={`${formatCurrency(data?.pipelineValue ?? 0)} weighted`} href="/business-development/leads" icon={ArrowTrendingRegular} color="bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400" />
        <KpiCard title="Customers" value={String(data?.customers.length ?? 0)} sub="Active accounts" href="/business-development/customers" icon={PeopleRegular} color="bg-muted text-foreground" />
        <KpiCard title="Pending Quotes" value={String(pendingQuotes.length)} sub={`${formatCurrency(pendingQuotes.reduce((s, q) => s + Number(q.totalAmount), 0))} in drafts & sent`} href="/business-development/quotations" icon={DocumentRegular} color="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline by Stage */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Pipeline by Stage</h2>
            <Link href="/business-development/leads" className="text-xs text-primary hover:underline">View all leads →</Link>
          </div>
          {byStage.length === 0 ? (
            <p className="text-sm text-brand-muted-light text-center py-8">No active leads in pipeline</p>
          ) : (
            <div className="space-y-3">
              {byStage.map((row) => (
                <div key={row.stage} className="flex items-center gap-3 text-sm">
                  <span className="w-24 text-xs text-muted-foreground shrink-0">{STAGE_LABELS[row.stage]}</span>
                  <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                    <svg className="h-full w-full" aria-hidden="true">
                      <rect x="0" y="0" width={`${Math.round((row.count / maxCount) * 100)}%`} height="100%" fill={STAGE_FILLS[row.stage] ?? '#d1d5db'} rx="10" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-foreground w-6 text-right">{row.count}</span>
                  <span className="text-xs text-brand-muted-light w-20 text-right">{formatCurrency(row.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Win Rate & Quick Links */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground mb-3">Win Rate</h2>
            <div className="text-center">
              <p className="text-4xl font-bold text-primary">{winRate}%</p>
              <p className="text-xs text-brand-muted-light mt-1">{wonLeads} won / {totalClosed} closed</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground mb-3">Quick Links</h2>
            <div className="space-y-2">
              {[
                { href: '/business-development/leads', label: 'Manage Leads' },
                { href: '/business-development/quotations', label: 'New Quotation' },
                { href: '/business-development/customers', label: 'Customer Accounts' },
                { href: '/business-development/bd-reports', label: 'BD Analytics' },
              ].map(({ href, label }) => (
                <Link key={href} href={href} className="flex items-center justify-between text-sm rounded-lg px-3 py-2 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                  {label}<ArrowRightRegular className="h-3.5 w-3.5 text-brand-muted-light" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
