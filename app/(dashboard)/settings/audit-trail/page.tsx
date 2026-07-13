'use client'

import { useState, useEffect, useCallback } from 'react'
import { FaShieldAlt, FaChevronDown, FaChevronRight, FaDownload } from 'react-icons/fa'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

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

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-500',
  VIEW: 'bg-purple-100 text-purple-600',
}

const MODULES = ['Finance', 'Operations', 'HR', 'BD', 'Tasks', 'Auth', 'System', 'Settings', 'Users']
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW']

function DiffRow({ old: oldVals, next: newVals }: { old: Record<string, unknown> | null; next: Record<string, unknown> | null }) {
  if (!oldVals && !newVals) return null
  const keys = Array.from(new Set([...Object.keys(oldVals ?? {}), ...Object.keys(newVals ?? {})]))
  const changed = keys.filter(k => JSON.stringify((oldVals ?? {})[k]) !== JSON.stringify((newVals ?? {})[k]))
  if (!changed.length) return <span className="text-gray-400 text-xs">No field changes recorded</span>

  return (
    <div className="space-y-0.5">
      {changed.map(k => (
        <p key={k} className="text-xs">
          <span className="font-medium text-gray-700">{k}:</span>{' '}
          {oldVals?.[k] !== undefined && (
            <span className="text-red-500 line-through mr-1">{String(oldVals[k])}</span>
          )}
          {newVals?.[k] !== undefined && (
            <span className="text-green-600">{String(newVals[k])}</span>
          )}
        </p>
      ))}
    </div>
  )
}

function ChangesCell({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasDiff = log.oldValues || log.newValues

  if (!hasDiff) return <span className="text-gray-400 text-xs">—</span>

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
      >
        {expanded ? <FaChevronDown className="h-3 w-3" /> : <FaChevronRight className="h-3 w-3" />}
        {expanded ? 'Hide' : 'Show'} changes
      </button>
      {expanded && (
        <div className="mt-1.5 bg-gray-50 rounded p-2">
          <DiffRow old={log.oldValues} next={log.newValues} />
        </div>
      )}
    </div>
  )
}

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

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
  }, [])

  function exportCSV() {
    const header = 'Timestamp,User,Action,Module,Record,OldValues,NewValues'
    const rows = logs.map(l =>
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
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Immutable record of all system activity"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          aria-label="Filter by user"
        >
          <option value="">All Users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          aria-label="Filter by module"
        >
          <option value="">All Modules</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          aria-label="Filter by action"
        >
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          aria-label="Date from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]"
          aria-label="Date to"
        />

        <button
          type="button"
          onClick={exportCSV}
          disabled={logs.length === 0}
          className="ml-auto flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
        >
          <FaDownload className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <FaShieldAlt className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No audit records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 whitespace-nowrap">Timestamp</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Module</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Record</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 min-w-[160px]">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#0D1B2A]">{log.userName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.module}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono truncate max-w-[120px]">
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
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fetchLogs(page - 1)}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
