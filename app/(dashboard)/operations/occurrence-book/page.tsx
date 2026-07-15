'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  AddRegular, BookOpenRegular, ShieldCheckmarkRegular, ShieldErrorRegular,
} from '@fluentui/react-icons'

interface Site { id: string; site_name: string | null }
interface OccurrenceEntry {
  id: string
  sequenceNumber: number
  entryType: string
  narrative: string
  recordedByName: string
  occurredAt: string
  entryHash: string
}
type FormValues = { entryType: string; narrative: string; occurredAt: string }

const ENTRY_TYPES = ['SHIFT_START', 'SHIFT_END', 'HANDOVER', 'VISITOR', 'DELIVERY', 'PATROL_NOTE', 'INCIDENT_REF', 'GENERAL']

const ENTRY_TYPE_LABELS: Record<string, string> = {
  SHIFT_START: 'Shift Start',
  SHIFT_END: 'Shift End',
  HANDOVER: 'Handover',
  VISITOR: 'Visitor',
  DELIVERY: 'Delivery',
  PATROL_NOTE: 'Patrol Note',
  INCIDENT_REF: 'Incident Reference',
  GENERAL: 'General',
}

const ENTRY_TYPE_STYLES: Record<string, string> = {
  SHIFT_START: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  SHIFT_END: 'bg-muted text-muted-foreground',
  HANDOVER: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  VISITOR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  DELIVERY: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PATROL_NOTE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  INCIDENT_REF: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  GENERAL: 'bg-muted text-muted-foreground',
}

function toLocalDateTimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function OccurrenceBookPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [entries, setEntries] = useState<OccurrenceEntry[]>([])
  const [chainValid, setChainValid] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { entryType: 'GENERAL', narrative: '', occurredAt: '' },
  })

  useEffect(() => {
    fetch('/api/operations/sites').then(r => r.json()).then(j => setSites(j.sites ?? [])).catch(() => {})
  }, [])

  const fetchEntries = useCallback(async (site: string) => {
    if (!site) { setEntries([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/operations/occurrence-book?siteId=${site}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load occurrence book'); setEntries([]); return }
      setEntries(json.entries ?? [])
      setChainValid(json.chainValid ?? true)
    } catch {
      toast.error('Network error loading occurrence book')
      setEntries([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchEntries(siteId) }, [siteId, fetchEntries])

  function openAdd() {
    reset({ entryType: 'GENERAL', narrative: '', occurredAt: toLocalDateTimeInput(new Date()) })
    setShowAdd(true)
  }

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/operations/occurrence-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, ...data, occurredAt: data.occurredAt ? new Date(data.occurredAt).toISOString() : undefined }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to log entry'); return }
    toast.success('Entry logged')
    setShowAdd(false)
    fetchEntries(siteId)
  }

  return (
    <div>
      <PageHeader
        title="Occurrence Book"
        description="Append-only, sequential shift log — entries can never be edited or deleted, only added"
        action={
          <Button type="button" onClick={openAdd} disabled={!siteId} className="bg-primary hover:bg-brand-red-dark text-white">
            <AddRegular className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-64">
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger><SelectValue placeholder="Select a site…" /></SelectTrigger>
            <SelectContent>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name ?? 'Unnamed site'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {siteId && entries.length > 0 && (
          chainValid ? (
            <span className="erp-badge erp-badge-success">
              <ShieldCheckmarkRegular className="h-3 w-3 mr-1" /> Chain verified
            </span>
          ) : (
            <span className="erp-badge erp-badge-danger">
              <ShieldErrorRegular className="h-3 w-3 mr-1" /> Chain integrity issue — a record may have been altered
            </span>
          )
        )}
      </div>

      <div className="erp-card !p-0 overflow-hidden">
        {!siteId ? (
          <div className="py-16">
            <EmptyState icon={BookOpenRegular} title="Select a site" description="Choose a site above to view its occurrence book" />
          </div>
        ) : loading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-3 w-10 bg-muted rounded" />
                <div className="h-3 flex-1 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={BookOpenRegular} title="No entries yet" description="Log the first occurrence book entry for this site" action={{ label: 'Add Entry', onClick: openAdd }} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="flex gap-4 px-5 py-4">
                <div className="flex-shrink-0 flex flex-col items-center w-12">
                  <span className="text-xs font-bold text-brand-muted-light tabular-nums">#{e.sequenceNumber}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`erp-badge ${ENTRY_TYPE_STYLES[e.entryType] ?? 'bg-muted text-muted-foreground'}`}>
                      {ENTRY_TYPE_LABELS[e.entryType] ?? e.entryType}
                    </span>
                    <span className="text-xs text-brand-muted-light">{formatDateTime(e.occurredAt)}</span>
                    <span className="text-xs text-brand-muted-light">· {e.recordedByName}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{e.narrative}</p>
                  <p className="text-[10px] text-brand-muted-light font-mono mt-1.5" title={e.entryHash}>
                    {e.entryHash.slice(0, 16)}…
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Occurrence Book Entry</DialogTitle>
            <DialogDescription>This entry cannot be edited or removed once logged.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Entry Type</Label>
              <Controller control={control} name="entryType" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTRY_TYPES.map((t) => <SelectItem key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Occurred At</Label>
              <input
                type="datetime-local"
                className="erp-field"
                {...register('occurredAt', { required: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Narrative *</Label>
              <Textarea placeholder="What happened…" rows={4} {...register('narrative', { required: true })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {isSubmitting ? 'Logging…' : 'Log Entry'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
