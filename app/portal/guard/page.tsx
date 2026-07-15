'use client'

import { useState, useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { CalendarLtrRegular, ClockRegular, DocumentRegular, ShieldRegular, SignOutRegular } from '@fluentui/react-icons';

interface SessionUser { id: string; name: string; email: string; role: string; companyId: string; guardId: string | null }
interface Deployment { id: string; siteId: string; startDate: string; endDate: string | null; shiftType: string; status: string; site?: { name: string } }
interface Attendance { id: string; date: string; checkIn: string | null; checkOut: string | null; hoursWorked: number; status: string }
interface Payslip { id: string; payrollRunId: string; grossPay: number; totalDeductions: number; netPay: number; hoursWorked: number; status: string; payrollRun?: { periodStart: string; periodEnd: string } }

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  COMPLETED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  PRESENT: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  ABSENT: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  LATE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  HALF_DAY: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  LEAVE: 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  PENDING: 'bg-muted text-muted-foreground',
}

export default function GuardPortalPage() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [guardId, setGuardId] = useState<string | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(j => { if (j.user?.role === 'GUARD') setUser(j.user) })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (!user) return
    setGuardId(user.guardId)
    if (!user.guardId) return
    setDataLoading(true)
    Promise.all([
      fetch('/api/portal/guard/deployments').then(r => r.json()).catch(() => ({ deployments: [] })),
      fetch('/api/portal/guard/attendance').then(r => r.json()).catch(() => ({ attendance: [] })),
      fetch('/api/portal/guard/payslips').then(r => r.json()).catch(() => ({ payslips: [] })),
    ]).then(([dep, att, pay]) => {
      setDeployments(dep.deployments ?? [])
      setAttendance((att.attendance ?? []).map((a: Record<string, unknown>) => ({ ...a, hoursWorked: Number(a.hoursWorked) })))
      setPayslips((pay.payslips ?? []).map((p: Record<string, unknown>) => ({ ...p, grossPay: Number(p.grossPay), totalDeductions: Number(p.totalDeductions), netPay: Number(p.netPay), hoursWorked: Number(p.hoursWorked) })))
    }).finally(() => setDataLoading(false))
  }, [user])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Login failed'); return }
      if (json.user?.role !== 'GUARD') { toast.error('This portal is for guards only'); return }
      setUser(json.user)
    } catch { toast.error('Network error') }
    finally { setLoginLoading(false) }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  // Monthly attendance summary
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const monthAttendance = attendance.filter(a => {
    const d = new Date(a.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const presentDays = monthAttendance.filter(a => a.status === 'PRESENT').length
  const totalHours = monthAttendance.reduce((sum, a) => sum + a.hoursWorked, 0)

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-muted/50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <ShieldRegular fontSize={28} className="text-primary" />
              <span className="text-xl font-bold text-foreground">Ravenshield</span>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-red-50 text-primary rounded-full px-3 py-1 text-xs font-medium">
              <ShieldRegular className="h-3 w-3" /> Guard Portal
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <h1 className="text-lg font-bold text-foreground mb-5">Guard Self-Service</h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="guard-email">Email</Label>
                <Input id="guard-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guard-password">Password</Label>
                <Input id="guard-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" disabled={loginLoading} className="w-full bg-primary hover:bg-brand-red-dark text-white">
                {loginLoading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <header className="bg-brand-navy text-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldRegular fontSize={20} className="text-primary" />
            <span className="font-bold">Ravenshield</span>
            <span className="text-brand-muted-light text-sm mx-1">·</span>
            <span className="text-sm text-brand-muted-light">Guard Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-muted-light">{user.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-brand-muted-light hover:text-white transition-colors"
              aria-label="Logout"
            >
              <SignOutRegular className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-foreground mb-2">Welcome, {user.name}</h1>
        {!guardId && !dataLoading && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No guard record found linked to this account. Contact your administrator.
          </div>
        )}

        {dataLoading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <Tabs.Root defaultValue="schedule">
            <Tabs.List className="flex gap-1 border-b border-border mb-5">
              {[
                { value: 'schedule', label: 'My Schedule', icon: CalendarLtrRegular },
                { value: 'attendance', label: 'Attendance', icon: ClockRegular },
                { value: 'payslips', label: 'Payslips', icon: DocumentRegular },
              ].map(({ value, label, icon: Icon }) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary transition-colors"
                >
                  <Icon className="h-4 w-4" /> {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="schedule">
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {deployments.length === 0 ? <p className="text-sm text-brand-muted-light text-center py-12">No deployments found</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Start Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">End Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Shift</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {deployments.map(dep => (
                        <tr key={dep.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium text-foreground">{dep.site?.name ?? dep.siteId}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(dep.startDate)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{dep.endDate ? formatDate(dep.endDate) : 'Ongoing'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{dep.shiftType}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[dep.status] ?? ''}`}>{dep.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="attendance">
              {/* Monthly summary */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-card rounded-lg border border-border p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{presentDays}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Days Present (this month)</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{totalHours.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Hours Worked (this month)</p>
                </div>
              </div>
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {attendance.length === 0 ? <p className="text-sm text-brand-muted-light text-center py-12">No attendance records</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Check In</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Check Out</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Hours</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {attendance.slice(0, 60).map(a => (
                        <tr key={a.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium text-foreground text-xs">{formatDate(a.date)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{a.checkOut ? new Date(a.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{a.hoursWorked.toFixed(1)}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] ?? ''}`}>{a.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="payslips">
              <div className="space-y-3">
                {payslips.length === 0 ? <p className="text-sm text-brand-muted-light text-center py-12">No payslips available</p> : payslips.map(ps => (
                  <div key={ps.id} className="bg-card rounded-lg border border-border p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {ps.payrollRun ? `${formatDate(ps.payrollRun.periodStart)} – ${formatDate(ps.payrollRun.periodEnd)}` : 'Pay Period'}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Gross: <strong className="text-foreground">${ps.grossPay.toFixed(2)}</strong></span>
                        <span>Deductions: <strong className="text-foreground">${ps.totalDeductions.toFixed(2)}</strong></span>
                        <span>Net: <strong className="text-foreground font-bold">${ps.netPay.toFixed(2)}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[ps.status] ?? ''}`}>{ps.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        )}
      </main>
    </div>
  )
}
