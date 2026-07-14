'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { ArrowRightRegular, CalendarLtrRegular, ClipboardTaskListLtrRegular, ClockRegular, MailInboxRegular, PeopleRegular, WarningRegular } from '@fluentui/react-icons';

interface Task { id: string; title: string; dueDate: string; priority: string; status: string; assignedToUser: { name: string } | null }
interface Meeting { id: string; title: string; meetingDate: string; location: string | null; status: string }
interface Request { id: string; title: string; requestType: string; status: string; createdAt: string }

function KpiCard({ title, value, icon: Icon, href, color }: { title: string; value: number; icon: React.ElementType; href: string; color: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:shadow-md transition-shadow group">
      <div className={`rounded-lg p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground truncate">{title}</p>
      </div>
      <ArrowRightRegular className="h-4 w-4 text-brand-muted-light group-hover:text-muted-foreground transition-colors shrink-0" />
    </Link>
  )
}

function isOverdue(dateStr: string, status: string) {
  return !['COMPLETED', 'CANCELLED'].includes(status) && new Date(dateStr) < new Date()
}

export default function TasksRequestsDashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks/tasks').then(r => r.json()),
      fetch('/api/tasks/meetings?status=SCHEDULED').then(r => r.json()),
      fetch('/api/tasks/requests?status=PENDING').then(r => r.json()),
    ]).then(([t, m, r]) => {
      setTasks(t.tasks ?? [])
      setMeetings(m.meetings ?? [])
      setRequests(r.requests ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const openTasks = tasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status))
  const overdueTasks = openTasks.filter(t => isOverdue(t.dueDate, t.status))
  const upcomingMeetings = meetings.filter(m => new Date(m.meetingDate) >= new Date()).slice(0, 5)
  const pendingRequests = requests.slice(0, 5)

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-foreground">Tasks &amp; Requests</h1>
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Tasks &amp; Requests</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Team productivity at a glance</p>
        </div>
        <Link href="/tasks-requests/calendar" className="text-sm text-primary hover:underline flex items-center gap-1"><CalendarLtrRegular className="h-4 w-4" /> Open Calendar</Link>
      </div>

      {/* Overdue alert */}
      {overdueTasks.length > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <WarningRegular className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700"><strong>{overdueTasks.length} task{overdueTasks.length !== 1 ? 's' : ''} overdue.</strong> <Link href="/tasks-requests/tasks" className="underline">Review now →</Link></p>
        </div>
      )}

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Open Tasks" value={openTasks.length} icon={ClipboardTaskListLtrRegular} href="/tasks-requests/tasks" color="bg-red-50 text-primary" />
        <KpiCard title="Pending Requests" value={requests.length} icon={MailInboxRegular} href="/tasks-requests/requests" color="bg-amber-50 text-amber-600" />
        <KpiCard title="Upcoming Meetings" value={upcomingMeetings.length} icon={CalendarLtrRegular} href="/tasks-requests/meetings" color="bg-blue-50 text-blue-600" />
        <KpiCard title="Overdue Tasks" value={overdueTasks.length} icon={WarningRegular} href="/tasks-requests/tasks" color="bg-orange-50 text-orange-600" />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* My Open Tasks */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Open Tasks</h2>
            <Link href="/tasks-requests/tasks" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="text-sm text-brand-muted-light text-center py-8">No open tasks</p>
          ) : (
            <div className="divide-y divide-border">
              {openTasks.slice(0, 6).map(task => (
                <div key={task.id} className={`flex items-center gap-3 px-5 py-3 text-sm ${isOverdue(task.dueDate, task.status) ? 'border-l-2 border-l-red-400' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-xs text-brand-muted-light mt-0.5">{task.assignedToUser?.name ?? 'Unassigned'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-brand-muted-light flex items-center gap-1"><ClockRegular className="h-3 w-3" />{formatDate(task.dueDate)}</span>
                    {isOverdue(task.dueDate, task.status) && <span className="text-xs text-red-500 font-medium">Overdue</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Upcoming Meetings + Pending Requests */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground text-sm flex items-center gap-1.5"><PeopleRegular className="h-4 w-4" /> Upcoming Meetings</h2>
              <Link href="/tasks-requests/meetings" className="text-xs text-primary hover:underline">All →</Link>
            </div>
            {upcomingMeetings.length === 0 ? (
              <p className="text-xs text-brand-muted-light text-center py-5">No upcoming meetings</p>
            ) : (
              <div className="divide-y divide-border">
                {upcomingMeetings.map(m => (
                  <div key={m.id} className="px-4 py-2.5 text-xs">
                    <p className="font-medium text-foreground truncate">{m.title}</p>
                    <p className="text-brand-muted-light mt-0.5">{formatDate(m.meetingDate)}{m.location ? ` · ${m.location}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground text-sm flex items-center gap-1.5"><MailInboxRegular className="h-4 w-4" /> Pending Requests</h2>
              <Link href="/tasks-requests/requests" className="text-xs text-primary hover:underline">All →</Link>
            </div>
            {pendingRequests.length === 0 ? (
              <p className="text-xs text-brand-muted-light text-center py-5">No pending requests</p>
            ) : (
              <div className="divide-y divide-border">
                {pendingRequests.map(r => (
                  <div key={r.id} className="px-4 py-2.5 text-xs">
                    <p className="font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-brand-muted-light mt-0.5">{r.requestType} · {formatDate(r.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
