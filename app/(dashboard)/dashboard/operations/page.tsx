'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { FaUserShield, FaMapMarkerAlt, FaUserClock, FaUserCheck, FaExclamationTriangle, FaRoute, FaChartBar } from 'react-icons/fa'
import { MdVerifiedUser } from 'react-icons/md'
import { TbBuildingSkyscraper, TbShieldExclamation } from 'react-icons/tb'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { formatDateTime } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import Link from 'next/link'

interface OpsData {
  activeGuards: number
  activeSites: number
  deployedToday: number
  undeployedGuards: number
  present: number
  absent: number
  attendanceRate: number
  openIncidents: number
  investigatingIncidents: number
  criticalIncidents: number
  patrolsDueToday: number
  patrolsCompleted: number
  patrolComplianceRate: number
  pendingCoverage: number
  equipmentAvailable: number
  equipmentAssigned: number
  incidentsBySeverity: { severity: string; count: number }[]
  siteAttendanceRates: { siteName: string; rate: number }[]
  recentIncidents: { title: string; siteName: string; severity: string; status: string; reportedAt: string }[]
  upcomingPatrols: { siteName: string; guardName: string; scheduledTime: string; status: string }[]
}

const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
import { SEVERITY_COLORS as THEME_SEVERITY_COLORS } from '@/lib/theme'
const SEVERITY_COLORS: Record<string, string> = THEME_SEVERITY_COLORS
const SEV_BADGE: Record<string, string> = { LOW: 'bg-green-100 text-green-700', MEDIUM: 'bg-amber-100 text-amber-700', HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700' }
const STATUS_BADGE: Record<string, string> = { OPEN: 'bg-red-100 text-red-700', INVESTIGATING: 'bg-amber-100 text-amber-700', RESOLVED: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-600' }
const DASHBOARD_REFRESH_MS = 30_000

export default function OperationsDashboardPage() {
  const [data, setData] = useState<OpsData | null>(null)
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
        const res = await fetch('/api/dashboard/operations', { cache: 'no-store' })
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
    <DashboardPageShell title="Operations Dashboard" subtitle="Guard & site management">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load dashboard data.</p>
    </DashboardPageShell>
  )

  return (
    <DashboardPageShell title="Operations Dashboard" subtitle="Guard deployment, attendance & incidents">
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Deployments', href: '/operations/deployments', Icon: FaMapMarkerAlt },
            { label: 'Record Attendance', href: '/operations/attendance', Icon: FaUserCheck },
            { label: 'Log Incident', href: '/operations/incidents', Icon: FaExclamationTriangle },
            { label: 'Schedule Patrol', href: '/operations/patrols', Icon: FaRoute },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 px-3 py-1.5 erp-btn erp-btn-ghost erp-btn-sm">
              <Icon size={13} /> {label}
            </Link>
          ))}
        </div>

        {/* Row 1 — Guard Status */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Active Guards" value={data!.activeGuards} icon={FaUserShield} color="navy" />
            <KPICard title="Deployed Today" value={data!.deployedToday} icon={FaMapMarkerAlt} color="red" />
            <KPICard title="Undeployed" value={data!.undeployedGuards} icon={FaUserClock} color={data!.undeployedGuards > 0 ? 'amber' : 'white'} />
            <KPICard title="Active Sites" value={data!.activeSites} icon={TbBuildingSkyscraper} color="white" />
          </>}
        </div>

        {/* Row 2 — Attendance & Incidents */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Present Today" subtitle={`${data!.attendanceRate}% rate`} value={data!.present} icon={FaUserCheck} color="green" />
            <KPICard title="Absent Today" value={data!.absent} icon={FaUserClock} color={data!.absent > 0 ? 'amber' : 'white'} />
            <KPICard title="Open Incidents" value={data!.openIncidents} icon={FaExclamationTriangle} color={data!.openIncidents > 0 ? 'red' : 'white'} />
            <KPICard title="Critical" value={data!.criticalIncidents} icon={TbShieldExclamation} color={data!.criticalIncidents > 0 ? 'red' : 'white'} />
          </>}
        </div>

        {/* Row 3 — Patrols */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Patrols Due" subtitle="Today" value={data!.patrolsDueToday} icon={FaRoute} color="white" />
            <KPICard title="Completed" subtitle="Today" value={data!.patrolsCompleted} icon={MdVerifiedUser} color="green" />
            <KPICard title="Compliance" subtitle="This month" value={`${data!.patrolComplianceRate}%`} icon={MdVerifiedUser} color={data!.patrolComplianceRate >= 90 ? 'green' : 'amber'} />
            <KPICard title="Pending Coverage" value={data!.pendingCoverage} icon={FaUserShield} color={data!.pendingCoverage > 0 ? 'amber' : 'white'} />
          </>}
        </div>

        {/* Row 4 — Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-4">Site Attendance Rates — This Month</h3>
            {loading ? <div className="h-52 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.siteAttendanceRates.length ?
              <EmptyState icon={FaChartBar} title="No attendance data" description="Attendance data will appear here" /> :
              <ResponsiveContainer width="100%" height={208}>
                <BarChart data={data!.siteAttendanceRates} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" domain={[0,100]} tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="siteName" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip formatter={(value: any) => `${Number(value ?? 0)}%`} contentStyle={CT} />
                  <Bar dataKey="rate" name="Attendance" fill="#E74C5B" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>

          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-4">Incidents by Severity — This Month</h3>
            {loading ? <div className="h-52 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.incidentsBySeverity.length ?
              <EmptyState icon={FaExclamationTriangle} title="No incidents this month" description="Incidents will appear here once logged" /> :
              <ResponsiveContainer width="100%" height={208}>
                <PieChart>
                  <Pie data={data!.incidentsBySeverity} dataKey="count" nameKey="severity" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {data!.incidentsBySeverity.map(e => <Cell key={e.severity} fill={SEVERITY_COLORS[e.severity] ?? '#9CA3AF'} />)}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [value, name]} contentStyle={CT} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Row 5 — Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Recent Incidents</h3>
            {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.recentIncidents.length ?
              <p className="text-sm text-gray-400 text-center py-6">No incidents logged</p> :
              <div className="space-y-2">
                {data!.recentIncidents.map((inc, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{inc.title}</p>
                      <p className="text-[10px] text-gray-500">{inc.siteName} · {formatDateTime(inc.reportedAt)}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${SEV_BADGE[inc.severity] ?? 'bg-gray-100 text-gray-600'}`}>{inc.severity}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_BADGE[inc.status] ?? 'bg-gray-100 text-gray-600'}`}>{inc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>

          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Upcoming Patrols</h3>
            {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.upcomingPatrols.length ?
              <p className="text-sm text-gray-400 text-center py-6">No patrols scheduled</p> :
              <div className="space-y-2">
                {data!.upcomingPatrols.map((p, i) => {
                  const isOverdue = new Date(p.scheduledTime) < new Date()
                  return (
                    <div key={i} className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 ${isOverdue ? 'text-red-600' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{p.siteName}</p>
                        <p className={`text-[10px] ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>{p.guardName} · {formatDateTime(p.scheduledTime)}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${p.status === 'DELAYED' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>
      </div>
    </DashboardPageShell>
  )
}




