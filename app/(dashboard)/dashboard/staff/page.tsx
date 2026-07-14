'use client'

import { useEffect, useState } from 'react'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import Link from 'next/link'
import { useCurrentUser } from '@/lib/user-context'
import { CalendarLtrRegular, CheckmarkCircleRegular, DocumentAddRegular, TaskListLtrRegular, VideoRegular, WarningRegular } from '@fluentui/react-icons';

interface StaffData {
  taskStats: { total: number; overdue: number; dueToday: number; completedThisWeek: number }
  myTasks: { id: string; title: string; dueDate: string; priority: string; status: string }[]
  meetingsToday: { id: string; title: string; startTime: string; endTime: string; location: string | null; organizer: string }[]
  meetingsThisWeek: number
  unreadNotifications: number
  upcomingDeadlines: { id: string; title: string; dueDate: string; priority: string }[]
  myRequests: { id: string; requestType: string; title: string; status: string; createdAt: string }[]
}

const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export default function StaffDashboardPage() {
  const [data, setData] = useState<StaffData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { name } = useCurrentUser()

  useEffect(() => {
    fetch('/api/dashboard/staff')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (error) return (
    <DashboardPageShell title="My Workspace" subtitle="Your tasks & meetings">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load your workspace.</p>
    </DashboardPageShell>
  )

  const today = new Date()
  const isOverdue = (dueDate: string) => new Date(dueDate) < today

  // Group deadlines by date
  const deadlineGroups: Record<string, StaffData['upcomingDeadlines']> = {}
  const deadlines = data?.upcomingDeadlines ?? []
  deadlines.forEach(t => {
    const key = formatDate(t.dueDate)
    if (!deadlineGroups[key]) deadlineGroups[key] = []
    deadlineGroups[key].push(t)
  })

  return (
    <DashboardPageShell title="My Workspace" subtitle="Tasks, meetings & deadlines">
      <div className="space-y-6">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-foreground">Good {greeting()}, {name}!</p>
            <p className="text-xs text-muted-foreground">{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'New Task', href: '/tasks-requests/tasks', Icon: TaskListLtrRegular },
            { label: 'Schedule Meeting', href: '/tasks-requests/meetings', Icon: CalendarLtrRegular },
            { label: 'Submit Request', href: '/tasks-requests/requests', Icon: DocumentAddRegular },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 px-3 py-1.5 erp-btn erp-btn-ghost erp-btn-sm">
              <Icon fontSize={13} /> {label}
            </Link>
          ))}
        </div>

        {/* Row 1 — Task Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Open Tasks" value={data!.taskStats.total} icon={TaskListLtrRegular} color="navy" />
            <KPICard title="Due Today" value={data!.taskStats.dueToday} icon={CalendarLtrRegular} color={data!.taskStats.dueToday > 0 ? 'red' : 'white'} />
            <KPICard title="Overdue" value={data!.taskStats.overdue} icon={WarningRegular} color={data!.taskStats.overdue > 0 ? 'amber' : 'white'} />
            <KPICard title="Done This Week" value={data!.taskStats.completedThisWeek} icon={CheckmarkCircleRegular} color="green" />
          </>}
        </div>

        {/* Today's Meetings */}
        {(!loading && data!.meetingsToday.length > 0) && (
          <div className="bg-card erp-card">
            <div className="flex items-center gap-2 mb-3">
              <VideoRegular className="text-primary" fontSize={14} />
              <h3 className="text-sm font-semibold text-foreground">Today&apos;s Meetings</h3>
            </div>
            <div className="space-y-2">
              {data!.meetingsToday.map(m => (
                <div key={m.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className="text-xs text-primary font-medium shrink-0 w-20">
                    {new Date(m.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{m.title}</p>
                    <p className="text-[10px] text-muted-foreground">{m.location ?? 'No location'} · {m.organizer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row 3 — Tasks & Deadlines */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card erp-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">My Tasks</h3>
              <Link href="/tasks-requests/tasks" className="text-[10px] text-primary hover:underline">View All →</Link>
            </div>
            {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
              !data?.myTasks.length ?
              <EmptyState icon={TaskListLtrRegular} title="No open tasks" description="You're all caught up!" /> :
              <div className="space-y-2">
                {data!.myTasks.slice(0, 8).map(t => {
                  const overdue = isOverdue(t.dueDate) && t.status !== 'COMPLETED'
                  return (
                    <div key={t.id} className={`flex items-center gap-3 py-2 border-b border-border last:border-0 pl-2 ${overdue ? 'border-l-2 border-red-400' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{t.title}</p>
                        <p className={`text-[10px] ${overdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>Due {formatDate(t.dueDate)}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${PRIORITY_BADGE[t.priority] ?? 'bg-muted text-muted-foreground'}`}>{t.priority}</span>
                    </div>
                  )
                })}
              </div>
            }
          </div>

          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming Deadlines</h3>
            {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
              !data?.upcomingDeadlines.length ?
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckmarkCircleRegular className="text-green-400" fontSize={28} />
                <p className="text-sm text-muted-foreground mt-2">Clear week ahead</p>
              </div> :
              <div className="space-y-3">
                {Object.entries(deadlineGroups).map(([date, tasks]) => (
                  <div key={date}>
                    <p className="text-[10px] font-semibold text-brand-muted-light uppercase mb-1">{date}</p>
                    {tasks.map(t => (
                      <p key={t.id} className="text-xs text-foreground py-0.5 flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${t.priority === 'URGENT' ? 'bg-primary' : t.priority === 'HIGH' ? 'bg-orange-500' : 'bg-gray-400'}`} />
                        {t.title}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            }
          </div>
        </div>

        {/* Pending Requests */}
        {!loading && data!.myRequests.length > 0 && (
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">My Pending Requests</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-brand-muted-light border-b border-border">
                {['Type', 'Title', 'Status', 'Submitted'].map(h => <th key={h} className="text-left pb-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data!.myRequests.map(r => (
                  <tr key={r.id}>
                    <td className="py-2 text-muted-foreground">{r.requestType}</td>
                    <td className="py-2 text-foreground truncate max-w-[160px]">{r.title}</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{r.status}</span></td>
                    <td className="py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardPageShell>
  )
}



