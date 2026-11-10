'use client'

import { KPICard } from './KPICard'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { timeAgo } from '@/lib/utils'
import { ArrowTrendingRegular, BuildingRegular, ClockRegular, DocumentRegular, PeopleRegular, ShieldRegular, TaskListSquareLtrRegular, WarningRegular } from '@fluentui/react-icons';

interface Stats {
  guardCount: number
  activeGuards: number
  siteCount: number
  activeSites: number
  openIncidents: number
  pendingLeave: number
  pendingTasks: number
  overdueInvoices: number
}

interface ActivityItem {
  id: string
  userName: string
  action: string
  module: string
  createdAt: string
}

export function DashboardStats({
  stats,
  recentActivity,
}: {
  stats: Stats
  recentActivity: ActivityItem[]
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-brand-navy">Dashboard</h1>
        <p className="text-sm text-brand-muted mt-0.5">Welcome back — here&apos;s what&apos;s happening today</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Guards"
          value={stats.guardCount}
          subtitle={`${stats.activeGuards} active`}
          icon={ShieldRegular}
          color="navy"
        />
        <KPICard
          title="Sites"
          value={stats.siteCount}
          subtitle={`${stats.activeSites} active`}
          icon={BuildingRegular}
          color="blue"
        />
        <KPICard
          title="Open Incidents"
          value={stats.openIncidents}
          subtitle="Needs attention"
          icon={WarningRegular}
          color={stats.openIncidents > 0 ? 'red' : 'green'}
        />
        <KPICard
          title="Pending Leave"
          value={stats.pendingLeave}
          subtitle="Awaiting approval"
          icon={ClockRegular}
          color="amber"
        />
        <KPICard
          title="My Tasks"
          value={stats.pendingTasks}
          subtitle="In progress / pending"
          icon={TaskListSquareLtrRegular}
          color="blue"
        />
        <KPICard
          title="Overdue Invoices"
          value={stats.overdueInvoices}
          subtitle="Action required"
          icon={DocumentRegular}
          color={stats.overdueInvoices > 0 ? 'red' : 'green'}
        />
        <KPICard
          title="Guard Utilisation"
          value={stats.guardCount > 0 ? `${Math.round((stats.activeGuards / stats.guardCount) * 100)}%` : '—'}
          subtitle="Active / total"
          icon={PeopleRegular}
          color="navy"
        />
        <KPICard
          title="Site Utilisation"
          value={stats.siteCount > 0 ? `${Math.round((stats.activeSites / stats.siteCount) * 100)}%` : '—'}
          subtitle="Active / total"
          icon={ArrowTrendingRegular}
          color="green"
        />
      </div>

      {/* Recent Activity */}
      <Card className="bg-card border border-brand-border shadow-sm">
        <CardHeader className="pb-3">
          <h2 className="text-sm font-semibold text-brand-navy">Recent Activity</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {recentActivity.length === 0 ? (
            <p className="text-sm text-brand-muted text-center py-6">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-brand-red flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-navy">
                      <span className="font-medium">{item.userName}</span>{' '}
                      <span className="text-brand-muted">{item.action.toLowerCase()}</span>{' '}
                      <span className="text-brand-muted">in {item.module}</span>
                    </p>
                  </div>
                  <p className="text-xs text-brand-muted flex-shrink-0">
                    {timeAgo(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


