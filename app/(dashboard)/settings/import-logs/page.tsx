'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowClockwiseRegular, ChevronDownRegular, ChevronRightRegular, HistoryRegular } from '@fluentui/react-icons'

interface ImportJob {
  id: string
  module: string
  mode: string
  status: string
  totalRows: number
  validRows: number
  invalidRows: number
  successCount: number
  failureCount: number
  userName: string
  createdAt: string
  completedAt: string | null
}

interface ImportJobRow {
  id: string
  rowNumber: number
  classification: string
  action: string | null
  errors: string[] | null
}

const MODULES = [
  { value: 'employees', label: 'Employees' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'sites', label: 'Sites' },
]

const STATUS_STYLES: Record<string, string> = {
  READY: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  PROCESSING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  FAILED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  ROLLED_BACK: 'bg-muted text-muted-foreground',
}

function JobDetail({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<ImportJobRow[] | null>(null)

  useEffect(() => {
    fetch(`/api/settings/import-logs/${jobId}`)
      .then((r) => r.json())
      .then((j) => setRows(j.job?.rows ?? []))
      .catch(() => setRows([]))
  }, [jobId])

  if (rows === null) return <p className="text-xs text-muted-foreground px-4 py-3">Loading rows…</p>

  return (
    <div className="px-4 py-3 bg-muted/30">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left py-1 pr-3">Row</th>
            <th className="text-left py-1 pr-3">Classification</th>
            <th className="text-left py-1 pr-3">Action</th>
            <th className="text-left py-1">Errors</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-1 pr-3">{r.rowNumber}</td>
              <td className="py-1 pr-3">{r.classification}</td>
              <td className="py-1 pr-3">{r.action ?? '—'}</td>
              <td className="py-1 text-red-600">{(r.errors ?? []).join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ImportLogsPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [loading, setLoading] = useState(true)
  const [filterModule, setFilterModule] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterModule) params.set('module', filterModule)
    try {
      const res = await fetch(`/api/settings/import-logs?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load import logs'); setJobs([]); return }
      setJobs(json.jobs ?? [])
    } catch {
      toast.error('Network error loading import logs')
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [filterModule])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  async function rollback(job: ImportJob) {
    if (!confirm(`Undo this import? ${job.successCount} row(s) will be deleted or reverted.`)) return
    setRollingBack(job.id)
    try {
      const moduleBase: Record<string, string> = {
        employees: '/api/hr/employees/import',
        customers: '/api/finance/customers/import',
        suppliers: '/api/finance/suppliers/import',
        sites: '/api/operations/sites/import',
      }
      const res = await fetch(`${moduleBase[job.module] ?? '/api/settings/import-logs'}/${job.id}/rollback`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Rollback failed'); return }
      toast.success(`Rolled back: ${json.deleted} deleted, ${json.restored} restored`)
      fetchJobs()
    } catch {
      toast.error('Network error rolling back import')
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <div>
      <PageHeader title="Import Logs" description="History of every bulk import across all modules" />

      <div className="mt-4 flex items-center gap-3">
        <select
          value={filterModule}
          onChange={(e) => setFilterModule(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by module"
        >
          <option value="">All Modules</option>
          {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center">
            <HistoryRegular className="h-10 w-10 text-brand-muted-light mx-auto mb-3" />
            <p className="text-sm text-brand-muted-light">No imports have been run yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="w-8 px-2 py-2.5"></th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Module</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Mode</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Success</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Failed</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((job) => (
                  <Fragment key={job.id}>
                    <tr className="hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}>
                      <td className="px-2 py-3 text-center text-brand-muted-light">
                        {expandedId === job.id ? <ChevronDownRegular className="h-3.5 w-3.5 inline" /> : <ChevronRightRegular className="h-3.5 w-3.5 inline" />}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(job.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-foreground capitalize">{job.module}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{job.mode}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{job.userName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status] ?? 'bg-muted text-muted-foreground'}`}>{job.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{job.totalRows}</td>
                      <td className="px-4 py-3 text-right text-green-600">{job.successCount}</td>
                      <td className="px-4 py-3 text-right text-red-600">{job.failureCount}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {job.status === 'COMPLETED' && job.successCount > 0 && (
                          <button
                            type="button"
                            onClick={() => rollback(job)}
                            disabled={rollingBack === job.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50"
                          >
                            <ArrowClockwiseRegular className="h-3.5 w-3.5" /> {rollingBack === job.id ? 'Undoing…' : 'Undo'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === job.id && (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <JobDetail jobId={job.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
