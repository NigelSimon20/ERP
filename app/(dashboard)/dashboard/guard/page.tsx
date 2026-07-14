'use client'

import { useEffect, useState } from 'react'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import Link from 'next/link'
import { CalculatorRegular, CalendarLtrRegular, CheckmarkCircleRegular, ClockRegular, DocumentRegular, LocationRegular, PersonAvailableRegular, PersonClockRegular, ShieldRegular, TaskListLtrRegular } from '@fluentui/react-icons';

interface GuardData {
  myProfile: { name: string; rank: string | null; department: string | null; employeeNumber: string; status: string } | null
  myCurrentDeployment: { shiftType: string; site: { name: string; address: string } | null } | null
  myAttendanceToday: { status: string; checkIn: string | null; checkOut: string | null; hoursWorked: number } | null
  myMonthStats: { daysPresent: number; daysAbsent: number; hoursWorked: number; overtimeHours: number }
  myLatestPayslip: { netPay: number; periodStart: string; periodEnd: string } | null
  myOpenTasks: { id: string; title: string; dueDate: string; priority: string; status: string }[]
  myUpcomingPatrols: { siteName: string; scheduledTime: string; status: string }[]
  myPendingLeave: number
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

export default function GuardDashboardPage() {
  const [data, setData] = useState<GuardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    fetch('/api/dashboard/guard')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (error) return (
    <DashboardPageShell title="My Dashboard" subtitle="Your personal workspace">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load your dashboard.</p>
    </DashboardPageShell>
  )

  return (
    <DashboardPageShell title="My Dashboard" subtitle="Your assignments, attendance & pay">
      <div className="space-y-6">
        {/* Welcome */}
        {!loading && data?.myProfile && (
          <div className="bg-brand-navy rounded-xl p-5 text-white">
            <p className="text-lg font-bold">Good {greeting()}, {data.myProfile.name}!</p>
            <p className="text-sm text-white/60 mt-0.5">{data.myProfile.rank ?? 'Guard'} {data.myProfile.department ? `· ${data.myProfile.department}` : ''}</p>
            <p className="text-sm text-white/50 mt-3">
              {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}{time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        )}

        {/* Row 1 — Status Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Current Site */}
          <div className="bg-card erp-card">
            <div className="flex items-center gap-2 mb-3">
              {loading ? <div className="h-4 w-32 bg-muted rounded animate-pulse" /> : <>
                {data?.myCurrentDeployment ? <LocationRegular className="text-primary" fontSize={16} /> : <PersonClockRegular className="text-brand-muted-light" fontSize={16} />}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current Deployment</p>
              </>}
            </div>
            {loading ? <div className="h-12 bg-border rounded-xl animate-pulse" /> :
              data?.myCurrentDeployment?.site ? <>
                <p className="font-semibold text-foreground">{data.myCurrentDeployment.site.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.myCurrentDeployment.site.address}</p>
                <span className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{data.myCurrentDeployment.shiftType}</span>
              </> :
              <p className="text-sm text-brand-muted-light">Not currently deployed</p>
            }
          </div>

          {/* Attendance Today */}
          <div className="bg-card erp-card">
            <div className="flex items-center gap-2 mb-3">
              {loading ? <div className="h-4 w-32 bg-muted rounded animate-pulse" /> : <>
                {data?.myAttendanceToday ? <CheckmarkCircleRegular className="text-green-600" fontSize={16} /> : <PersonClockRegular className="text-brand-muted-light" fontSize={16} />}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attendance Today</p>
              </>}
            </div>
            {loading ? <div className="h-12 bg-border rounded-xl animate-pulse" /> :
              data?.myAttendanceToday ? <>
                <p className="font-semibold text-green-600">Checked in</p>
                {data.myAttendanceToday.checkIn && <p className="text-xs text-muted-foreground mt-1">at {new Date(data.myAttendanceToday.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>}
                {data.myAttendanceToday.checkOut && <p className="text-xs text-muted-foreground">{data.myAttendanceToday.hoursWorked.toFixed(1)} hours worked</p>}
              </> :
              <p className="text-sm text-brand-muted-light">Not checked in today</p>
            }
          </div>

          {/* Latest Pay */}
          <div className="bg-card erp-card">
            <div className="flex items-center gap-2 mb-3">
              <ClockRegular className="text-brand-muted-light" fontSize={16} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Latest Pay</p>
            </div>
            {loading ? <div className="h-12 bg-border rounded-xl animate-pulse" /> :
              data?.myLatestPayslip ? <>
                <p className="text-2xl font-bold text-primary">{formatCurrency(data.myLatestPayslip.netPay)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatDate(data.myLatestPayslip.periodStart)} – {formatDate(data.myLatestPayslip.periodEnd)}</p>
                <Link href="/human-resources/payslips" className="text-[10px] text-primary hover:underline font-medium">View Payslip →</Link>
              </> :
              <p className="text-sm text-brand-muted-light">No payslips yet</p>
            }
          </div>
        </div>

        {/* Row 2 — Month Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Days Present" subtitle="This month" value={data!.myMonthStats.daysPresent} icon={PersonAvailableRegular} color="green" />
            <KPICard title="Days Absent" subtitle="This month" value={data!.myMonthStats.daysAbsent} icon={PersonClockRegular} color={data!.myMonthStats.daysAbsent > 0 ? 'amber' : 'white'} />
            <KPICard title="Hours Worked" subtitle="This month" value={`${data!.myMonthStats.hoursWorked.toFixed(0)} h`} icon={ClockRegular} color="white" />
            <KPICard title="Overtime" subtitle="This month" value={`${data!.myMonthStats.overtimeHours.toFixed(1)} h`} icon={CalculatorRegular} color="white" />
          </>}
        </div>

        {/* Row 3 — Patrols & Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming Patrols</h3>
            {loading ? <div className="h-28 bg-border rounded-xl animate-pulse" /> :
              !data?.myUpcomingPatrols.length ?
              <EmptyState icon={ShieldRegular} title="No patrols scheduled" description="Your patrol schedule will appear here" /> :
              <div className="space-y-2">
                {data!.myUpcomingPatrols.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">{p.siteName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDateTime(p.scheduledTime)}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${p.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            }
          </div>

          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">My Open Tasks</h3>
            {loading ? <div className="h-28 bg-border rounded-xl animate-pulse" /> :
              !data?.myOpenTasks.length ?
              <EmptyState icon={TaskListLtrRegular} title="No tasks assigned" description="Your tasks will appear here" /> :
              <div className="space-y-2">
                {data!.myOpenTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">Due {formatDate(t.dueDate)}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${PRIORITY_BADGE[t.priority] ?? 'bg-muted text-muted-foreground'}`}>{t.priority}</span>
                  </div>
                ))}
              </div>
            }
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Request Leave', href: '/human-resources/leave-requests', Icon: CalendarLtrRegular },
            { label: 'My Payslips', href: '/human-resources/payslips', Icon: DocumentRegular },
            { label: 'My Tasks', href: '/tasks-requests/tasks', Icon: TaskListLtrRegular },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-brand-red-dark">
              <Icon fontSize={13} /> {label}
            </Link>
          ))}
        </div>
      </div>
    </DashboardPageShell>
  )
}



