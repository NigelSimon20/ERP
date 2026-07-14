'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ChevronDownRegular, ChevronRightRegular, WarningRegular } from '@fluentui/react-icons';

interface Incident {
  id: string; title: string; description: string | null; severity: string; status: string
  reportedAt: string; resolvedAt: string | null; notes: string | null
  site: { id: string; name: string }; guard: { name: string } | null; reportedByUser: { name: string } | null
}
interface Site { id: string; name: string }
interface Guard { id: string; name: string }
type FormValues = { title: string; description: string; siteId: string; guardId: string; severity: string; reportedAt: string }
type StatusUpdate = { status: string; notes: string }

const SEV_STYLES: Record<string, string> = { LOW: 'bg-muted text-muted-foreground', MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400', CRITICAL: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }
const STATUS_STYLES: Record<string, string> = { OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', INVESTIGATING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', RESOLVED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', CLOSED: 'bg-muted text-muted-foreground' }
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const SEV_TABS = ['ALL', ...SEVERITIES]

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [sevTab, setSevTab] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updateTarget, setUpdateTarget] = useState<Incident | null>(null)

  const { register: cr, handleSubmit: cSubmit, control: cCtrl, reset: cReset, formState: { isSubmitting: cSubmitting } } = useForm<FormValues>({
    defaultValues: { title: '', description: '', siteId: '', guardId: '', severity: 'MEDIUM', reportedAt: '' },
  })
  const { register: ur, handleSubmit: uSubmit, reset: uReset, formState: { isSubmitting: uSubmitting } } = useForm<StatusUpdate>()

  async function fetchIncidents() {
    setLoading(true)
    const params = new URLSearchParams()
    if (sevTab !== 'ALL') params.set('severity', sevTab)
    if (filterStatus) params.set('status', filterStatus)
    try {
      const res = await fetch(`/api/operations/incidents?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load incidents'); setIncidents([]); return }
      setIncidents(json.incidents ?? [])
    } catch {
      toast.error('Network error loading incidents')
      setIncidents([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchIncidents() }, [sevTab, filterStatus])
  useEffect(() => {
    Promise.all([fetch('/api/operations/sites').then(r => r.json()), fetch('/api/guards').then(r => r.json())]).then(([s, g]) => {
      setSites(s.sites ?? []); setGuards(g.guards ?? [])
    }).catch((err) => {
      console.error(err)
      toast.error('Failed to load sites/guards')
    })
  }, [])

  async function onCreate(data: FormValues) {
    const res = await fetch('/api/operations/incidents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, guardId: data.guardId || null, reportedAt: data.reportedAt || undefined }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    if (data.severity === 'CRITICAL') toast.success('Critical incident reported — managers notified', { duration: 5000 })
    else toast.success('Incident created')
    setShowCreateDialog(false); cReset(); fetchIncidents()
  }

  function openUpdate(inc: Incident) {
    setUpdateTarget(inc)
    uReset({ status: inc.status, notes: inc.notes ?? '' })
  }

  async function onUpdate(data: StatusUpdate) {
    if (!updateTarget) return
    const res = await fetch(`/api/operations/incidents/${updateTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Incident updated'); setUpdateTarget(null); fetchIncidents()
  }

  return (
    <div>
      <PageHeader title="Incidents" description="Track and manage security incidents" action={<Button type="button" onClick={() => { cReset(); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Report Incident</Button>} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border-b border-border">
          {SEV_TABS.map(tab => (
            <button key={tab} type="button" onClick={() => setSevTab(tab)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${sevTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab}</button>
          ))}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="INVESTIGATING">Investigating</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : incidents.length === 0 ? (
          <div className="py-16"><EmptyState icon={WarningRegular} title="No incidents found" description="All clear — no incidents match your filters" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Report Incident</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="w-8 px-2 py-2.5"><span className="sr-only">Expand</span></th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Severity</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reported</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Guard</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <>
                  <tr key={inc.id} className="border-b border-border hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}>
                    <td className="px-2 py-3 text-center text-brand-muted-light">
                      {expandedId === inc.id ? <ChevronDownRegular className="h-3.5 w-3.5 inline" /> : <ChevronRightRegular className="h-3.5 w-3.5 inline" />}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{inc.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{inc.site?.name}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEV_STYLES[inc.severity] ?? 'bg-muted text-muted-foreground'}`}>{inc.severity}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[inc.status] ?? 'bg-muted text-muted-foreground'}`}>{inc.status}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(inc.reportedAt))}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{inc.guard?.name ?? '—'}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {inc.status !== 'CLOSED' && (
                        <button type="button" onClick={() => openUpdate(inc)} className="text-xs text-primary hover:underline" aria-label="Update status">Update</button>
                      )}
                    </td>
                  </tr>
                  {expandedId === inc.id && (
                    <tr key={`${inc.id}-exp`} className="bg-muted/50 border-b border-border">
                      <td colSpan={8} className="px-8 py-3 space-y-1.5">
                        {inc.description && <p className="text-sm text-foreground">{inc.description}</p>}
                        {inc.notes && <div className="text-xs text-muted-foreground bg-card border border-border rounded p-2"><strong>Notes:</strong> {inc.notes}</div>}
                        {inc.resolvedAt && <p className="text-xs text-green-600">Resolved: {formatDate(new Date(inc.resolvedAt))}</p>}
                        {inc.reportedByUser && <p className="text-xs text-brand-muted-light">Reported by: {inc.reportedByUser.name}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Report Incident</DialogTitle></DialogHeader>
          <form onSubmit={cSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5"><Label>Title *</Label><Input placeholder="Brief description of incident" {...cr('title', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Site *</Label>
                <Controller control={cCtrl} name="siteId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                    <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Controller control={cCtrl} name="severity" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Guard Involved</Label>
                <Controller control={cCtrl} name="guardId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent><SelectItem value="">— None —</SelectItem>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Date/Time</Label><Input type="datetime-local" {...cr('reportedAt')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea placeholder="Full details of what occurred…" rows={3} {...cr('description')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={cSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{cSubmitting ? 'Reporting…' : 'Report Incident'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status Update Dialog */}
      <Dialog open={!!updateTarget} onOpenChange={(open) => !open && setUpdateTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Incident — {updateTarget?.title}</DialogTitle></DialogHeader>
          <form onSubmit={uSubmit(onUpdate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="w-full h-9 rounded-md border border-border px-3 text-sm" {...ur('status')} aria-label="Incident status">
                <option value="OPEN">Open</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Investigation notes or resolution details…" rows={3} {...ur('notes')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUpdateTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={uSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{uSubmitting ? 'Saving…' : 'Update Incident'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
