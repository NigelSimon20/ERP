'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import toast from 'react-hot-toast'
import { ArrowDownloadRegular, ClockRegular, PeopleRegular } from '@fluentui/react-icons';

type Status = 'PRESENT' | 'ABSENT' | 'SICK' | 'LEAVE' | 'AWOL' | 'OFF' | 'INDUCTION_PAID' | 'INDUCTION_UNPAID' | 'RELIEVED' | 'TRANSFERRED'
type Shift = 'DAY' | 'NIGHT' | null

interface Guard { id: string; force_number: string | null; full_name: string | null; region: string | null }
interface AttendanceRecord { id: string; guardId: string; date: string; status: Status; shift: Shift; notes: string | null }
interface Site { id: string; site_name: string | null }
interface Mark { status: Status; shift: Shift }

const STATUS_META: Record<Status, { code: string; label: string; className: string }> = {
  PRESENT: { code: 'P', label: 'Present', className: 'bg-green-600' },
  ABSENT: { code: 'A', label: 'Absent', className: 'bg-primary' },
  SICK: { code: 'S', label: 'Sick', className: 'bg-amber-500' },
  LEAVE: { code: 'L', label: 'Leave', className: 'bg-blue-500' },
  AWOL: { code: 'W', label: 'AWOL', className: 'bg-brand-navy' },
  OFF: { code: 'O', label: 'Off', className: 'bg-gray-400' },
  INDUCTION_PAID: { code: 'IP', label: 'Induction Paid', className: 'bg-gray-500' },
  INDUCTION_UNPAID: { code: 'IU', label: 'Induction Unpaid', className: 'bg-amber-600' },
  RELIEVED: { code: 'RL', label: 'Relieved', className: 'bg-rose-800' },
  TRANSFERRED: { code: 'TR', label: 'Transferred', className: 'bg-blue-700' },
}
const STATUS_ORDER = Object.keys(STATUS_META) as Status[]
const SHIFT_CODE: Record<'DAY' | 'NIGHT', string> = { DAY: 'D', NIGHT: 'N' }

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
function cellKey(guardId: string, day: number): string {
  return `${guardId}_${day}`
}

export default function AttendancePage() {
  const [tab, setTab] = useState('timesheet')

  return (
    <div>
      <PageHeader title="Attendance Register" description="" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
          <TabsTrigger value="registers">Site Registers</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>
        <TabsContent value="timesheet"><TimesheetTab /></TabsContent>
        <TabsContent value="registers"><SiteRegistersTab /></TabsContent>
        <TabsContent value="audit"><AuditTrailTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function TimesheetTab() {
  const [month, setMonth] = useState(currentMonth())
  const [siteId, setSiteId] = useState('')
  const [region, setRegion] = useState('')
  const [sites, setSites] = useState<Site[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [daysInMonth, setDaysInMonth] = useState(31)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<Record<string, Mark>>({})
  const [editingCell, setEditingCell] = useState<{ guardId: string; day: number; guardName: string } | null>(null)
  const [pendingShift, setPendingShift] = useState<'DAY' | 'NIGHT'>('DAY')

  const fetchGrid = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month })
      if (siteId) params.set('siteId', siteId)
      if (region) params.set('region', region)
      const res = await fetch(`/api/operations/attendance?${params}`)
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load attendance')
        setGuards([]); setRecords([]); setRegions([]); setDaysInMonth(31)
        return
      }
      setGuards(json.guards ?? [])
      setRecords(json.records ?? [])
      setRegions(json.regions ?? [])
      setDaysInMonth(json.daysInMonth ?? 31)
    } catch {
      toast.error('Network error loading attendance')
      setGuards([]); setRecords([]); setRegions([]); setDaysInMonth(31)
    } finally {
      setLoading(false)
    }
  }, [month, siteId, region])

  useEffect(() => { fetchGrid() }, [fetchGrid])
  useEffect(() => {
    fetch('/api/operations/sites').then((r) => r.json()).then((j) => setSites(j.sites ?? [])).catch((err) => console.error(err))
  }, [])
  useEffect(() => { setPending({}) }, [month, siteId, region])

  const recordMap = useMemo(() => {
    const map: Record<string, Mark> = {}
    for (const r of records) {
      const day = new Date(r.date).getUTCDate()
      map[cellKey(r.guardId, day)] = { status: r.status, shift: r.shift }
    }
    return map
  }, [records])

  function markAt(guardId: string, day: number): Mark | null {
    return pending[cellKey(guardId, day)] ?? recordMap[cellKey(guardId, day)] ?? null
  }

  function openCell(guardId: string, day: number, guardName: string) {
    const existing = markAt(guardId, day)
    setPendingShift(existing?.shift === 'NIGHT' ? 'NIGHT' : 'DAY')
    setEditingCell({ guardId, day, guardName })
  }

  function applyStatus(status: Status) {
    if (!editingCell) return
    setPending((prev) => ({ ...prev, [cellKey(editingCell.guardId, editingCell.day)]: { status, shift: pendingShift } }))
    setEditingCell(null)
  }

  function clearCell() {
    if (!editingCell) return
    setPending((prev) => ({ ...prev, [cellKey(editingCell.guardId, editingCell.day)]: null as unknown as Mark }))
    setEditingCell(null)
  }

  const pendingCount = Object.keys(pending).length

  async function saveChanges() {
    setSaving(true)
    try {
      const toSave = Object.entries(pending).filter(([, v]) => v !== null)
      const records = toSave.map(([key, mark]) => {
        const [guardId, dayStr] = key.split('_')
        const day = Number(dayStr)
        const [y, m] = month.split('-')
        const date = `${y}-${m}-${String(day).padStart(2, '0')}`
        return { guardId, date, status: mark.status, shift: mark.shift }
      })
      if (records.length === 0) { toast('No changes to save'); return }
      const res = await fetch('/api/operations/attendance?action=bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }),
      })
      const json = await res.json()
      toast.success(`Saved ${json.success} record${json.success === 1 ? '' : 's'}${json.errors?.length ? `, ${json.errors.length} failed` : ''}`)
      setPending({})
      fetchGrid()
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const header = ['Force #', 'Name', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))]
    const rows = guards.map((g) => [
      g.force_number ?? '', g.full_name ?? '',
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const mark = markAt(g.id, i + 1)
        if (!mark) return ''
        const shiftCode = mark.shift ? SHIFT_CODE[mark.shift as 'DAY' | 'NIGHT'] ?? '' : ''
        return `${STATUS_META[mark.status].code}${shiftCode ? ' ' + shiftCode : ''}`
      }),
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `attendance-${month}.csv`
    a.click()
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">{daysInMonth}-Day Timesheet for {monthLabel(month)}</p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border border-border px-3 text-sm" aria-label="Month" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Site</label>
          <Select value={siteId || 'all'} onValueChange={(v) => setSiteId(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All Sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name ?? s.id}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Region</label>
          <Select value={region || 'all'} onValueChange={(v) => setRegion(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All Regions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}><ArrowDownloadRegular className="h-4 w-4 mr-1" /> Export</Button>
          <Button type="button" onClick={saveChanges} disabled={saving || pendingCount === 0} className="bg-primary hover:bg-brand-red-dark text-white">
            {saving ? 'Saving…' : `Save Changes${pendingCount ? ` (${pendingCount})` : ''}`}
          </Button>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-card px-4 py-2.5 flex flex-wrap items-center gap-4 text-xs">
        <span className="font-medium text-muted-foreground">Legend:</span>
        {STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${STATUS_META[s].className}`}>{STATUS_META[s].code}</span>
            <span className="text-muted-foreground">{STATUS_META[s].label}</span>
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : guards.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No guards found" description="No guards match the current filters" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="sticky left-0 bg-muted/50 text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap z-10">Force #</th>
                  <th className="sticky left-[88px] bg-muted/50 text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap z-10 border-r border-border">Name</th>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <th key={i} className="px-1 py-2 font-medium text-muted-foreground text-center w-11">{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {guards.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/50">
                    <td className="sticky left-0 bg-card text-xs text-muted-foreground px-3 py-1.5 whitespace-nowrap">{g.force_number ?? '—'}</td>
                    <td className="sticky left-[88px] bg-card text-xs font-medium text-foreground px-3 py-1.5 whitespace-nowrap border-r border-border">{g.full_name ?? '—'}</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1
                      const mark = markAt(g.id, day)
                      const isDirty = cellKey(g.id, day) in pending
                      return (
                        <td key={day} className="p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => openCell(g.id, day, g.full_name ?? '—')}
                            aria-label={`Mark attendance for ${g.full_name} on day ${day}`}
                            className={`h-9 w-10 rounded text-[11px] font-bold text-white flex flex-col items-center justify-center leading-none ${mark ? STATUS_META[mark.status].className : 'bg-muted text-brand-muted-light'} ${isDirty ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                          >
                            {mark ? (
                              <>
                                <span>{STATUS_META[mark.status].code}</span>
                                {mark.shift && <span className="text-[8px] opacity-90">{SHIFT_CODE[mark.shift as 'DAY' | 'NIGHT']}</span>}
                              </>
                            ) : '–'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!editingCell} onOpenChange={(open) => !open && setEditingCell(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCell?.guardName} — Day {editingCell?.day}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Shift:</span>
              <div className="flex gap-1">
                {(['DAY', 'NIGHT'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setPendingShift(s)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border ${pendingShift === s ? 'bg-brand-navy text-white border-brand-navy' : 'border-border text-muted-foreground'}`}>
                    {s === 'DAY' ? 'Day' : 'Night'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_ORDER.map((s) => (
                <button key={s} type="button" onClick={() => applyStatus(s)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white ${STATUS_META[s].className} hover:opacity-90`}>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/20 text-[10px] font-bold">{STATUS_META[s].code}</span>
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={clearCell}>Clear Mark</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SiteRegistersTab() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [guards, setGuards] = useState<Guard[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/operations/sites').then((r) => r.json()).then((j) => {
      setSites(j.sites ?? [])
      if (j.sites?.[0]?.id) setSiteId(j.sites[0].id)
    }).catch((err) => console.error(err))
  }, [])

  const fetchRegister = useCallback(async () => {
    if (!siteId) return
    setLoading(true)
    try {
      const month = date.slice(0, 7)
      const res = await fetch(`/api/operations/attendance?month=${month}&siteId=${siteId}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load attendance register'); setGuards([]); setRecords([]); return }
      setGuards(json.guards ?? [])
      setRecords(json.records ?? [])
    } catch {
      toast.error('Network error loading attendance register')
      setGuards([]); setRecords([])
    } finally {
      setLoading(false)
    }
  }, [siteId, date])

  useEffect(() => { fetchRegister() }, [fetchRegister])

  const day = new Date(date).getUTCDate()
  const statusFor = (guardId: string): Status | null => {
    const rec = records.find((r) => r.guardId === guardId && new Date(r.date).getUTCDate() === day)
    return rec?.status ?? null
  }

  async function quickMark(guardId: string, status: Status) {
    setSavingKey(guardId)
    try {
      await fetch('/api/operations/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardId, siteId, date, status }),
      })
      fetchRegister()
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Site</label>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Select site" /></SelectTrigger>
            <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name ?? s.id}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-md border border-border px-3 text-sm" aria-label="Date" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : guards.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No guards deployed" description="No active deployments found for this site" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Force #</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Quick Mark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {guards.map((g) => {
                const status = statusFor(g.id)
                return (
                  <tr key={g.id} className="hover:bg-muted/50">
                    <td className="px-4 py-2 text-xs text-muted-foreground">{g.force_number ?? '—'}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{g.full_name ?? '—'}</td>
                    <td className="px-4 py-2">
                      {status ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium text-white ${STATUS_META[status].className}`}>{STATUS_META[status].label}</span>
                      ) : <span className="text-xs text-brand-muted-light">Not marked</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {(['PRESENT', 'ABSENT', 'SICK', 'OFF'] as Status[]).map((s) => (
                          <button key={s} type="button" disabled={savingKey === g.id} onClick={() => quickMark(g.id, s)}
                            className={`h-6 w-6 rounded text-[10px] font-bold text-white ${STATUS_META[s].className} disabled:opacity-50`}>
                            {STATUS_META[s].code}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AuditTrailTab() {
  interface LogEntry { id: string; createdAt: string; userName: string; action: string; recordId: string | null }
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/audit?module=AttendanceRecord&page=${page}`).then((r) => r.json()).then((j) => {
      setLogs(j.logs ?? []); setTotal(j.total ?? 0)
    }).catch((err) => {
      console.error(err)
      toast.error('Failed to load audit history')
      setLogs([]); setTotal(0)
    }).finally(() => setLoading(false))
  }, [page])

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {loading ? (
        <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="py-16"><EmptyState icon={ClockRegular} title="No audit history" description="No attendance changes have been logged yet" /></div>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">When</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{l.userName}</td>
                  <td className="px-4 py-2 text-xs">{l.action}</td>
                  <td className="px-4 py-2 text-xs text-brand-muted-light">{l.recordId}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
            <span>{total} total</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button type="button" variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
