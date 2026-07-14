'use client'

import { useEffect, useState } from 'react'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { timeAgo } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { AddCircleRegular, ArrowEnterRegular, ArrowTrendingRegular, BuildingRegular, DeleteRegular, EditRegular, InfoRegular, ShieldErrorRegular, ShieldPersonRegular, SignOutRegular, TaskListLtrRegular } from '@fluentui/react-icons';

interface ReadOnlyData {
  activeGuards: number
  activeSites: number
  openIncidents: number
  pendingTasks: number
  recentMdShowChart: { action: string; module: string; userName: string; createdAt: string }[]
}

const ACTION_ICON: Record<string, React.ElementType> = {
  CREATE: AddCircleRegular,
  UPDATE: EditRegular,
  DELETE: DeleteRegular,
  LOGIN:  ArrowEnterRegular,
  LOGOUT: SignOutRegular,
}
const ACTION_STYLE: Record<string, string> = {
  CREATE: 'bg-green-50 text-green-500',
  UPDATE: 'bg-blue-50 text-blue-500',
  DELETE: 'bg-red-50 text-red-500',
  LOGIN:  'bg-muted text-brand-muted-light',
  LOGOUT: 'bg-muted text-brand-muted-light',
}

export default function ReadOnlyDashboardPage() {
  const [data, setData] = useState<ReadOnlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/readonly')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (error) return (
    <DashboardPageShell title="Overview" subtitle="System overview">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load overview.</p>
    </DashboardPageShell>
  )

  return (
    <DashboardPageShell title="Overview" subtitle="Read-only system overview">
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <InfoRegular className="text-blue-500 shrink-0 mt-0.5" fontSize={18} />
          <p className="text-sm text-blue-700">You have read-only access. Contact your administrator for additional permissions.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Active Guards" value={data!.activeGuards} icon={ShieldPersonRegular} color="white" />
            <KPICard title="Active Sites" value={data!.activeSites} icon={BuildingRegular} color="white" />
            <KPICard title="Open Incidents" value={data!.openIncidents} icon={ShieldErrorRegular} color="white" />
            <KPICard title="Pending Tasks" value={data!.pendingTasks} icon={TaskListLtrRegular} color="white" />
          </>}
        </div>

        {/* Recent ArrowTrendingRegular */}
        <div className="bg-card erp-card">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent ArrowTrendingRegular</h3>
          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-border rounded-xl animate-pulse" />)}</div>
          ) : !data?.recentMdShowChart.length ? (
            <EmptyState icon={ArrowTrendingRegular} title="No activity yet" description="System actions will appear here" />
          ) : (
            <ul className="divide-y divide-border">
              {data!.recentMdShowChart.map((item, idx) => {
                const Icon = ACTION_ICON[item.action] ?? ArrowTrendingRegular
                const style = ACTION_STYLE[item.action] ?? 'bg-muted text-brand-muted-light'
                return (
                  <li key={idx} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        <span className="font-semibold">{item.userName}</span>
                        {' · '}<span className="text-muted-foreground">{item.module}</span>
                      </p>
                      <p className="text-xs text-brand-muted-light">{timeAgo(item.createdAt)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardPageShell>
  )
}



