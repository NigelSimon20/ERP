'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { ArrowTrendingRegular, LocationRegular, PeopleRegular, ShieldRegular, WarningRegular, WrenchRegular } from '@fluentui/react-icons';

interface OpsStats {
  activeDeployments: number
  guardsOnDutyToday: number
  openIncidents: number
  patrolsDueToday: number
  availableEquipment: number
  criticalIncidents: number
}

interface RecentIncident { id: string; title: string; severity: string; site: { name: string }; reportedAt: string }

const SEV_COLORS: Record<string, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
}

function KPICard({ label, value, icon: Icon, color, href }: { label: string; value: number | string; icon: React.ElementType; color: string; href: string }) {
  return (
    <Link href={href} className={`rounded-xl p-4 text-white flex items-center justify-between group hover:opacity-90 transition-opacity ${color}`}>
      <div>
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </div>
      <Icon className="h-8 w-8 opacity-40 group-hover:opacity-60 transition-opacity" />
    </Link>
  )
}

export default function OperationsDashboardPage() {
  const [stats, setStats] = useState<OpsStats>({ activeDeployments: 0, guardsOnDutyToday: 0, openIncidents: 0, patrolsDueToday: 0, availableEquipment: 0, criticalIncidents: 0 })
  const [recentIncidents, setRecentIncidents] = useState<RecentIncident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]

    Promise.all([
      fetch('/api/operations/deployments?status=ACTIVE').then(r => r.json()),
      fetch(`/api/operations/attendance?date=${today}`).then(r => r.json()),
      fetch('/api/operations/incidents?status=OPEN').then(r => r.json()),
      fetch(`/api/operations/patrols?date=${today}&status=SCHEDULED`).then(r => r.json()),
      fetch('/api/operations/equipment?status=AVAILABLE').then(r => r.json()),
      fetch('/api/operations/incidents?status=OPEN&severity=CRITICAL').then(r => r.json()),
    ]).then(([deps, att, inc, pat, equip, crit]) => {
      setStats({
        activeDeployments: deps.deployments?.length ?? 0,
        guardsOnDutyToday: att.summary?.present ?? 0,
        openIncidents: inc.total ?? inc.incidents?.length ?? 0,
        patrolsDueToday: pat.patrols?.length ?? 0,
        availableEquipment: equip.equipment?.length ?? 0,
        criticalIncidents: crit.total ?? crit.incidents?.length ?? 0,
      })
      setRecentIncidents((inc.incidents ?? []).slice(0, 5))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div>
        <div className="mb-6"><h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1></div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Live overview of field operations</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard label="Active Deployments" value={stats.activeDeployments} icon={LocationRegular} color="bg-brand-navy" href="/operations/deployments" />
        <KPICard label="Guards on Duty Today" value={stats.guardsOnDutyToday} icon={ShieldRegular} color="bg-primary" href="/operations/attendance" />
        <KPICard label="Open Incidents" value={stats.openIncidents} icon={WarningRegular} color={stats.criticalIncidents > 0 ? 'bg-primary' : 'bg-amber-600'} href="/operations/incidents" />
        <KPICard label="Patrols Due Today" value={stats.patrolsDueToday} icon={ArrowTrendingRegular} color="bg-gray-600" href="/operations/patrols" />
        <KPICard label="Available Equipment" value={stats.availableEquipment} icon={WrenchRegular} color="bg-blue-600" href="/operations/equipment" />
        <KPICard label="Guards Assigned" value={stats.activeDeployments} icon={PeopleRegular} color="bg-green-700" href="/operations/sites" />
      </div>

      {stats.criticalIncidents > 0 && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <WarningRegular className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-red-700">{stats.criticalIncidents} critical incident{stats.criticalIncidents > 1 ? 's' : ''} require immediate attention</p>
          <Link href="/operations/incidents?severity=CRITICAL" className="ml-auto text-xs text-red-600 hover:underline font-medium">View →</Link>
        </div>
      )}

      {recentIncidents.length > 0 && (
        <div className="mt-5 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Open Incidents</h3>
            <Link href="/operations/incidents" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {recentIncidents.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{inc.title}</p>
                  <p className="text-xs text-brand-muted-light">{inc.site?.name} · {formatDate(new Date(inc.reportedAt))}</p>
                </div>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${SEV_COLORS[inc.severity] ?? 'bg-muted text-muted-foreground'}`}>{inc.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
