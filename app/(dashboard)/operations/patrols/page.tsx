'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ShieldRegular } from '@fluentui/react-icons';

interface Patrol { id: string; scheduledTime: string; actualTime: string | null; status: string; notes: string | null; site: { id: string; name: string }; guard: { id: string; name: string } | null }
interface Site { id: string; name: string }
interface Guard { id: string; name: string }
type ScheduleForm = { siteId: string; guardId: string; scheduledTime: string; notes: string }
type CompletionForm = { actualTime: string; status: string; notes: string }

const STATUS_STYLES: Record<string, string> = { SCHEDULED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', MISSED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300', DELAYED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' }

function fmtTime(dt: string | null) { return dt ? new Date(dt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—' }

export default function PatrolsPage() {
  const [patrols, setPatrols] = useState<Patrol[]>([])
  const [complianceRates, setComplianceRates] = useState<Record<string, number>>({})
  const [sites, setSites] = useState<Site[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [filterSite, setFilterSite] = useState('')
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [completionTarget, setCompletionTarget] = useState<Patrol | null>(null)

  const { register: sr, handleSubmit: sSubmit, control: sCtrl, reset: sReset, formState: { isSubmitting: sSubmitting } } = useForm<ScheduleForm>({
    defaultValues: { siteId: '', guardId: '', scheduledTime: '', notes: '' },
  })
  const { register: cr, handleSubmit: cSubmit, reset: cReset, formState: { isSubmitting: cSubmitting } } = useForm<CompletionForm>()

  async function fetchPatrols() {
    setLoading(true)
    const params = new URLSearchParams({ date })
    if (filterSite) params.set('siteId', filterSite)
    try {
      const res = await fetch(`/api/operations/patrols?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load patrols'); setPatrols([]); setComplianceRates({}); return }
      setPatrols(json.patrols ?? [])
      setComplianceRates(json.complianceRates ?? {})
    } catch {
      toast.error('Network error loading patrols')
      setPatrols([])
      setComplianceRates({})
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchPatrols() }, [date, filterSite])
  useEffect(() => {
    Promise.all([fetch('/api/operations/sites').then(r => r.json()), fetch('/api/guards').then(r => r.json())]).then(([s, g]) => {
      setSites(s.sites ?? []); setGuards(g.guards ?? [])
    }).catch((err) => {
      console.error(err)
      toast.error('Failed to load sites/guards')
    })
  }, [])

  async function onSchedule(data: ScheduleForm) {
    const res = await fetch('/api/operations/patrols', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, guardId: data.guardId || null, scheduledTime: `${date}T${data.scheduledTime}:00`, notes: data.notes || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Patrol scheduled'); setShowScheduleDialog(false); sReset(); fetchPatrols()
  }

  function openCompletion(p: Patrol) {
    setCompletionTarget(p)
    cReset({ actualTime: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), status: 'COMPLETED', notes: '' })
  }

  async function onComplete(data: CompletionForm) {
    if (!completionTarget) return
    const res = await fetch(`/api/operations/patrols/${completionTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualTime: `${date}T${data.actualTime}:00`, status: data.status, notes: data.notes || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Patrol recorded'); setCompletionTarget(null); fetchPatrols()
  }

  return (
    <div>
      <PageHeader title="Patrols" description="Schedule and track guard patrols" action={<Button type="button" onClick={() => { sReset(); setShowScheduleDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Schedule Patrol</Button>} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All sites" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All sites</SelectItem>
            {sites.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}{complianceRates[s.id] != null ? ` — ${complianceRates[s.id]}% compliance` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : patrols.length === 0 ? (
          <div className="py-16"><EmptyState icon={ShieldRegular} title="No patrols scheduled" description={`No patrols for ${date}`} action={<Button type="button" onClick={() => setShowScheduleDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Schedule Patrol</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Guard</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Scheduled</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actual</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Notes</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patrols.map((p) => (
                <tr key={p.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{p.site?.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.guard?.name ?? <span className="text-brand-muted-light">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{fmtTime(p.scheduledTime)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{fmtTime(p.actualTime)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status] ?? 'bg-muted text-muted-foreground'}`}>{p.status}</span></td>
                  <td className="px-4 py-3 text-brand-muted-light text-xs">{p.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    {p.status === 'SCHEDULED' && (
                      <button type="button" onClick={() => openCompletion(p)} className="text-xs text-green-600 hover:underline" aria-label="Record patrol completion">Record</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Schedule Patrol</DialogTitle></DialogHeader>
          <form onSubmit={sSubmit(onSchedule)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Controller control={sCtrl} name="siteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Guard</Label>
              <Controller control={sCtrl} name="guardId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                  <SelectContent><SelectItem value="">— Unassigned —</SelectItem>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5"><Label>Scheduled Time *</Label><Input type="time" {...sr('scheduledTime', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Route or instructions" {...sr('notes')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={sSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{sSubmitting ? 'Saving…' : 'Schedule'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Completion Dialog */}
      <Dialog open={!!completionTarget} onOpenChange={(open) => !open && setCompletionTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Patrol — {completionTarget?.site?.name}</DialogTitle></DialogHeader>
          <form onSubmit={cSubmit(onComplete)} className="space-y-4">
            <div className="space-y-1.5"><Label>Actual Time</Label><Input type="time" {...cr('actualTime')} /></div>
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <select className="w-full h-9 rounded-md border border-border px-3 text-sm" {...cr('status')} aria-label="Patrol outcome">
                <option value="COMPLETED">Completed</option>
                <option value="DELAYED">Delayed</option>
                <option value="MISSED">Missed</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Observations or issues" {...cr('notes')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCompletionTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={cSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{cSubmitting ? 'Saving…' : 'Save Record'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
