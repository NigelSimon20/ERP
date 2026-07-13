'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { FaUserShield, FaUserClock, FaIdCard, FaCalendarAlt, FaBell, FaUserCheck, FaMoneyCheckAlt, FaCheckCircle, FaTimesCircle, FaChartBar, FaUsers } from 'react-icons/fa'
import { RiTeamLine } from 'react-icons/ri'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { SkeletonKPI, SkeletonChart } from '@/components/dashboard/SkeletonLoaders'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface HRData {
  totalEmployees: number
  activeEmployees: number
  suspendedEmployees: number
  newHiresThisMonth: number
  pendingLeave: number
  approvedLeaveThisMonth: number
  onLeaveToday: number
  attendanceRate: number
  overtimeHours: number
  lastPayroll: { periodStart: string; periodEnd: string; totalGross: number; totalNet: number; status: string } | null
  departmentHeadcount: { department: string; count: number }[]
  leaveByType: { leaveType: string; count: number }[]
  recentLeaveRequests: { id: string; guardId: string; guardName: string; leaveType: string; startDate: string; endDate: string; daysRequested: number }[]
  upcomingBirthdays: { name: string; birthday: string; department: string }[]
}

const LEAVE_COLORS = ['#E74C5B', '#374151', '#F59E0B', '#22C55E', '#7C3AED', '#0891B2']
const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
const TICK = { fontSize: 11, fill: '#9CA3AF' }
const DASHBOARD_REFRESH_MS = 30_000

export default function HRDashboardPage() {
  const [data, setData] = useState<HRData | null>(null)
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
        const res = await fetch('/api/dashboard/hr', { cache: 'no-store' })
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

  async function handleLeave(id: string, guardId: string, approve: boolean) {
    try {
      const res = await fetch('/api/hr/leave-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: approve ? 'APPROVED' : 'REJECTED' }),
      })
      if (!res.ok) throw new Error()
      toast.success(approve ? 'Leave approved' : 'Leave rejected')
      setData(d => d ? { ...d, recentLeaveRequests: d.recentLeaveRequests.filter(l => l.id !== id), pendingLeave: d.pendingLeave - 1 } : d)
    } catch {
      toast.error('Action failed')
    }
  }

  if (error) return (
    <DashboardPageShell title="HR Dashboard" subtitle="People & payroll overview">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load dashboard data.</p>
    </DashboardPageShell>
  )

  return (
    <DashboardPageShell title="HR Dashboard" subtitle="Headcount, leave & payroll">
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Add Employee', href: '/human-resources/employees', Icon: FaIdCard },
            { label: 'Review Leave', href: '/human-resources/leave-requests', Icon: FaCalendarAlt },
            { label: 'Run Payroll', href: '/human-resources/payroll', Icon: FaMoneyCheckAlt },
            { label: 'Attendance', href: '/operations/attendance', Icon: FaUserCheck },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 px-3 py-1.5 erp-btn erp-btn-ghost erp-btn-sm">
              <Icon size={13} /> {label}
            </Link>
          ))}
        </div>

        {/* Row 1 — Headcount */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Total Employees" value={data!.totalEmployees} icon={RiTeamLine} color="navy" />
            <KPICard title="Active" value={data!.activeEmployees} icon={FaUserShield} color="green" />
            <KPICard title="Suspended" value={data!.suspendedEmployees} icon={FaUserClock} color={data!.suspendedEmployees > 0 ? 'amber' : 'white'} />
            <KPICard title="New Hires" subtitle="This month" value={data!.newHiresThisMonth} icon={FaIdCard} color="white" />
          </>}
        </div>

        {/* Row 2 — Leave & Attendance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Pending Leave" value={data!.pendingLeave} icon={FaCalendarAlt} color={data!.pendingLeave > 0 ? 'amber' : 'white'} />
            <KPICard title="On Leave Today" value={data!.onLeaveToday} icon={FaBell} color="white" />
            <KPICard title="Attendance Rate" subtitle="This month" value={`${data!.attendanceRate}%`} icon={FaUserCheck} color={data!.attendanceRate >= 90 ? 'green' : 'amber'} />
            <KPICard title="Overtime Hours" value={`${data!.overtimeHours.toFixed(1)} h`} icon={FaUserClock} color="white" />
          </>}
        </div>

        {/* Payroll Summary */}
        {!loading && (
          <div className="bg-white erp-card">
            <div className="flex items-center gap-2 mb-3">
              <FaMoneyCheckAlt className="text-[#E74C5B]" size={16} />
              <h3 className="text-sm font-semibold text-[#1F2937]">Latest Payroll Run</h3>
            </div>
            {!data?.lastPayroll ? (
              <p className="text-sm text-gray-400">No payroll runs recorded yet</p>
            ) : (
              <div className="flex flex-wrap gap-6 text-sm">
                <div><p className="text-xs text-gray-500">Period</p><p className="font-medium">{formatDate(data.lastPayroll.periodStart)} – {formatDate(data.lastPayroll.periodEnd)}</p></div>
                <div><p className="text-xs text-gray-500">Gross</p><p className="font-medium">{formatCurrency(data.lastPayroll.totalGross)}</p></div>
                <div><p className="text-xs text-gray-500">Net</p><p className="font-bold text-[#E74C5B]">{formatCurrency(data.lastPayroll.totalNet)}</p></div>
                <div><p className="text-xs text-gray-500">Status</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${data.lastPayroll.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{data.lastPayroll.status}</span>
                </div>
                <Link href="/human-resources/payslips" className="text-xs text-[#E74C5B] hover:underline font-medium self-center">View Payslips →</Link>
              </div>
            )}
          </div>
        )}

        {/* Row 3 — Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-4">Department Headcount</h3>
            {loading ? <div className="h-52 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.departmentHeadcount.length ?
              <EmptyState icon={FaChartBar} title="No department data" description="Assign departments to employees" /> :
              <ResponsiveContainer width="100%" height={208}>
                <BarChart data={data!.departmentHeadcount} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="department" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip contentStyle={CT} />
                  <Bar dataKey="count" name="Headcount" fill="#374151" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>

          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-4">Leave by Type</h3>
            {loading ? <div className="h-52 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.leaveByType.length ?
              <EmptyState icon={FaCalendarAlt} title="No leave data" description="Leave requests will appear here" /> :
              <ResponsiveContainer width="100%" height={208}>
                <PieChart>
                  <Pie data={data!.leaveByType} dataKey="count" nameKey="leaveType" cx="50%" cy="50%" outerRadius={80} paddingAngle={3}>
                    {data!.leaveByType.map((_, i) => <Cell key={i} fill={LEAVE_COLORS[i % LEAVE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={CT} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Row 4 — Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Pending Leave Requests</h3>
            {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.recentLeaveRequests.length ?
              <p className="text-sm text-gray-400 text-center py-6">No pending leave requests</p> :
              <div className="space-y-2">
                {data!.recentLeaveRequests.map(l => (
                  <div key={l.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800">{l.guardName}</p>
                      <p className="text-[10px] text-gray-500">{l.leaveType} · {formatDate(l.startDate)} – {formatDate(l.endDate)} ({l.daysRequested}d)</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => handleLeave(l.id, l.guardId, true)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Approve"><FaCheckCircle size={16} /></button>
                      <button type="button" onClick={() => handleLeave(l.id, l.guardId, false)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Reject"><FaTimesCircle size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>

          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Upcoming Birthdays</h3>
            {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.upcomingBirthdays.length ?
              <EmptyState icon={FaUsers} title="No upcoming birthdays" description="No birthdays in the next 7 days" /> :
              <div className="space-y-2">
                {data!.upcomingBirthdays.map((g, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="h-8 w-8 rounded-full bg-[#E74C5B]/10 flex items-center justify-center text-[#E74C5B] font-bold text-xs shrink-0">
                      {g.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800">{g.name}</p>
                      <p className="text-[10px] text-gray-500">{g.department} · {new Date(g.birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        </div>
      </div>
    </DashboardPageShell>
  )
}



