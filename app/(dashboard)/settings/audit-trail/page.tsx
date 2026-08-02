'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowDownloadRegular, ChevronDownRegular, ChevronRightRegular, ShieldRegular } from '@fluentui/react-icons';

interface AuditLog {
  id: string
  userId: string
  userName: string
  action: string
  module: string
  recordId: string | null
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  createdAt: string
}

interface User { id: string; name: string }

interface UserActivity {
  userId: string
  userName: string
  totalActions: number
  loginCount: number
  firstActivity: string
  lastActivity: string
  byModule: { module: string; count: number }[]
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  DELETE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  LOGIN: 'bg-muted text-muted-foreground',
  LOGOUT: 'bg-muted text-muted-foreground',
  VIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
}

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW']

function DiffRow({ old: oldVals, next: newVals }: { old: Record<string, unknown> | null; next: Record<string, unknown> | null }) {
  if (!oldVals && !newVals) return null
  const keys = Array.from(new Set([...Object.keys(oldVals ?? {}), ...Object.keys(newVals ?? {})]))
  const changed = keys.filter(k => JSON.stringify((oldVals ?? {})[k]) !== JSON.stringify((newVals ?? {})[k]))
  if (!changed.length) return <span className="text-brand-muted-light text-xs">No field changes recorded</span>

  return (
    <div className="space-y-0.5">
      {changed.map(k => (
        <p key={k} className="text-xs">
          <span className="font-medium text-foreground">{k}:</span>{' '}
          {oldVals?.[k] !== undefined && (
            <span className="text-primary line-through mr-1">{String(oldVals[k])}</span>
          )}
          {newVals?.[k] !== undefined && (
            <span className="text-green-600 dark:text-green-400">{String(newVals[k])}</span>
          )}
        </p>
      ))}
    </div>
  )
}

function ChangesCell({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasDiff = log.oldValues || log.newValues

  if (!hasDiff) return <span className="text-brand-muted-light text-xs">—</span>

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs text-primary hover:text-brand-red-dark"
      >
        {expanded ? <ChevronDownRegular className="h-3 w-3" /> : <ChevronRightRegular className="h-3 w-3" />}
        {expanded ? 'Hide' : 'Show'} changes
      </button>
      {expanded && (
        <div className="mt-1.5 bg-muted/50 rounded p-2">
          <DiffRow old={log.oldValues} next={log.newValues} />
        </div>
      )}
    </div>
  )
}

export default function AuditTrailPage() {
  const [view, setView] = useState<'log' | 'activity'>('log')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [modules, setModules] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [activity, setActivity] = useState<UserActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityFrom, setActivityFrom] = useState('')
  const [activityTo, setActivityTo] = useState('')

  async function fetchActivity() {
    setActivityLoading(true)
    try {
      const params = new URLSearchParams()
      if (activityFrom) params.set('from', activityFrom)
      if (activityTo) params.set('to', activityTo)
      const res = await fetch(`/api/reports/user-activity?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load user activity'); setActivity([]); return }
      setActivity(json.users ?? [])
    } catch { toast.error('Network error loading user activity'); setActivity([]) } finally { setActivityLoading(false) }
  }

  useEffect(() => { if (view === 'activity') fetchActivity() }, [view])

  async function exportActivityPdf() {
    try {
      const { exportReportPdf } = await import('@/lib/pdf')
      const settingsRes = await fetch('/api/settings')
      const company = settingsRes.ok ? (await settingsRes.json()).company ?? {} : {}
      await exportReportPdf('user-activity', { users: activity }, company, { from: activityFrom || undefined, to: activityTo || undefined })
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  const [filterUser, setFilterUser] = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg) })
    if (filterUser) params.set('userId', filterUser)
    if (filterModule) params.set('module', filterModule)
    if (filterAction) params.set('action', filterAction)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    try {
      const res = await fetch(`/api/audit?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load audit trail'); setLogs([]); setTotal(0); return }
      setLogs(json.logs ?? [])
      setTotal(json.total ?? 0)
      setPage(pg)
    } catch {
      toast.error('Network error loading audit trail')
      setLogs([])
      setTotal(0)
    } finally { setLoading(false) }
  }, [filterUser, filterModule, filterAction, dateFrom, dateTo])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? [])).catch(() => {})
    fetch('/api/audit/modules').then(r => r.json()).then(j => setModules(j.modules ?? [])).catch(() => {})
  }, [])

  const [exporting, setExporting] = useState(false)

  // The on-screen `logs` state is just the current page (PAGE_SIZE=50) --
  // both exports need every row matching the active filters, not only what's
  // currently rendered, so this re-fetches every page up front.
  async function fetchAllMatchingLogs(): Promise<AuditLog[]> {
    const all: AuditLog[] = []
    let pg = 1
    while (true) {
      const params = new URLSearchParams({ page: String(pg) })
      if (filterUser) params.set('userId', filterUser)
      if (filterModule) params.set('module', filterModule)
      if (filterAction) params.set('action', filterAction)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/audit?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load audit trail')
      all.push(...(json.logs ?? []))
      if (all.length >= (json.total ?? 0) || !json.logs?.length) break
      pg++
    }
    return all
  }

  async function exportCSV() {
    setExporting(true)
    try {
      const allLogs = await fetchAllMatchingLogs()
      const header = 'Timestamp,User,Action,Module,Record,OldValues,NewValues'
      const rows = allLogs.map(l =>
        [
          new Date(l.createdAt).toISOString(),
          `"${l.userName}"`,
          l.action,
          l.module,
          l.recordId ?? '',
          l.oldValues ? `"${JSON.stringify(l.oldValues).replace(/"/g, '""')}"` : '',
          l.newValues ? `"${JSON.stringify(l.newValues).replace(/"/g, '""')}"` : '',
        ].join(',')
      )
      const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export CSV')
    } finally {
      setExporting(false)
    }
  }

  async function exportPdf() {
    setExporting(true)
    try {
      const allLogs = await fetchAllMatchingLogs()
      const { exportReportPdf } = await import('@/lib/pdf')
      const settingsRes = await fetch('/api/settings')
      const company = settingsRes.ok ? (await settingsRes.json()).company ?? {} : {}
      await exportReportPdf('audit-trail', {
        rows: allLogs.map((l) => ({ createdAt: l.createdAt, userName: l.userName, module: l.module, action: l.action, recordId: l.recordId })),
      }, company, {})
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Immutable record of all system activity"
      />

      {/* View Tabs */}
      <div className="mt-2 mb-4 flex gap-1 border-b border-border">
        {(['log', 'activity'] as const).map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${view === v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {v === 'log' ? 'Log' : 'User Activity'}
          </button>
        ))}
      </div>

      {view === 'activity' ? (
        <div>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">From</label>
              <input type="date" value={activityFrom} onChange={(e) => setActivityFrom(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2 bg-card" aria-label="Activity from date" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">To</label>
              <input type="date" value={activityTo} onChange={(e) => setActivityTo(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-2 bg-card" aria-label="Activity to date" />
            </div>
            <button type="button" onClick={fetchActivity} className="text-sm px-3 py-2 rounded-lg bg-primary text-white hover:bg-brand-red-dark">Generate</button>
            {activity.length > 0 && (
              <button type="button" onClick={exportActivityPdf} className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50">
                <ArrowDownloadRegular className="h-4 w-4" /> Export PDF
              </button>
            )}
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {activityLoading ? (
              <div className="py-12 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : activity.length === 0 ? (
              <div className="py-16 text-center">
                <ShieldRegular className="h-10 w-10 text-brand-muted-light mx-auto mb-3" />
                <p className="text-sm text-brand-muted-light">No activity found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total Actions</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Logins</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">First Activity</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last Activity</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Top Modules</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activity.map((u) => (
                      <tr key={u.userId} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium text-foreground">{u.userName}</td>
                        <td className="px-4 py-3 text-right">{u.totalActions}</td>
                        <td className="px-4 py-3 text-right">{u.loginCount}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(u.firstActivity)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(u.lastActivity)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{u.byModule.slice(0, 3).map((m) => `${m.module} (${m.count})`).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by user"
        >
          <option value="">All Users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by module"
        >
          <option value="">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by action"
        >
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Date from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Date to"
        />

        <button
          type="button"
          onClick={exportCSV}
          disabled={logs.length === 0 || exporting}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-40"
        >
          <ArrowDownloadRegular className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        <button
          type="button"
          onClick={exportPdf}
          disabled={logs.length === 0 || exporting}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-40"
        >
          <ArrowDownloadRegular className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldRegular className="h-10 w-10 text-brand-muted-light mx-auto mb-3" />
            <p className="text-sm text-brand-muted-light">No audit records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Timestamp</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Module</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Record</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground min-w-[160px]">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.userName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] ?? 'bg-muted text-muted-foreground'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.module}</td>
                    <td className="px-4 py-3 text-xs text-brand-muted-light font-mono truncate max-w-[120px]">
                      {log.recordId ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <ChangesCell log={log} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchLogs(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-40 hover:bg-muted/50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-border rounded-lg disabled:opacity-40 hover:bg-muted/50"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
