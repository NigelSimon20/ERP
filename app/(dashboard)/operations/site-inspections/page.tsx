'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ClipboardTaskRegular } from '@fluentui/react-icons'

interface SiteInspection {
  id: string
  overallRating: string
  findings: string
  status: string
  inspectedAt: string
  site: { id: string; name: string } | null
}
interface Site { id: string; name: string }
interface ChecklistItem { item: string; pass: boolean; note: string }

const CHECKLIST_TEMPLATE = [
  'Guards present and in correct uniform',
  'Access control functioning correctly',
  'CCTV/security equipment operational',
  'Post orders being followed',
  'Occurrence book up to date',
  'Perimeter and lighting secure',
]
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const RATING_STYLES: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  CRITICAL: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
}
function RatingBadge({ rating }: { rating: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${RATING_STYLES[rating] ?? 'bg-muted text-foreground'}`}>{rating}</span>
}

export default function SiteInspectionsPage() {
  const [rows, setRows] = useState<SiteInspection[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [siteId, setSiteId] = useState('')
  const [overallRating, setOverallRating] = useState('MEDIUM')
  const [findings, setFindings] = useState('')
  const [correctiveActions, setCorrectiveActions] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>(CHECKLIST_TEMPLATE.map((item) => ({ item, pass: true, note: '' })))
  const [submitting, setSubmitting] = useState(false)

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/operations/site-inspections')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load site inspections'); setRows([]); return }
      setRows(json.siteInspections ?? [])
    } catch { toast.error('Network error loading site inspections'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => { fetch('/api/operations/sites').then((r) => r.json()).then((j) => setSites(j.sites ?? [])).catch((err) => console.error(err)) }, [])

  function openCreate() {
    setSiteId(''); setOverallRating('MEDIUM'); setFindings(''); setCorrectiveActions('')
    setChecklist(CHECKLIST_TEMPLATE.map((item) => ({ item, pass: true, note: '' })))
    setShowCreateDialog(true)
  }

  async function onCreate() {
    if (!siteId) { toast.error('Select a site'); return }
    if (!findings) { toast.error('Enter findings'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/operations/site-inspections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, checklist, overallRating, findings, correctiveActions }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Site inspection recorded')
      setShowCreateDialog(false)
      fetchRows()
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      <PageHeader
        title="Site Inspections"
        description="Security site inspection checklists and findings"
        action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Inspection</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={ClipboardTaskRegular} title="No site inspections found" description="Record your first site inspection" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Inspected</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Overall Rating</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{row.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.inspectedAt))}</td>
                    <td className="px-4 py-3"><RatingBadge rating={row.overallRating} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Site Inspection</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Site *</Label>
                <Select onValueChange={setSiteId} value={siteId}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Overall Rating</Label>
                <Select onValueChange={setOverallRating} value={overallRating}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Checklist</Label>
              <div className="space-y-2">
                {checklist.map((c, i) => (
                  <div key={c.item} className="flex items-center gap-3 rounded-md border border-border p-2">
                    <div className="flex-1 text-sm text-foreground">{c.item}</div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setChecklist((prev) => prev.map((x, xi) => xi === i ? { ...x, pass: true } : x))} className={`px-2 py-1 rounded text-xs font-medium ${c.pass ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>Pass</button>
                      <button type="button" onClick={() => setChecklist((prev) => prev.map((x, xi) => xi === i ? { ...x, pass: false } : x))} className={`px-2 py-1 rounded text-xs font-medium ${!c.pass ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' : 'bg-muted text-muted-foreground'}`}>Fail</button>
                    </div>
                    <input className="w-40 h-8 rounded-md border border-border px-2 text-xs bg-background" placeholder="Note (optional)" value={c.note} onChange={(e) => setChecklist((prev) => prev.map((x, xi) => xi === i ? { ...x, note: e.target.value } : x))} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Findings *</Label>
              <Textarea placeholder="Overall findings from the inspection" value={findings} onChange={(e) => setFindings(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Corrective Actions</Label>
              <Textarea placeholder="Actions required to address any failures" value={correctiveActions} onChange={(e) => setCorrectiveActions(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="button" onClick={onCreate} disabled={submitting} className="bg-primary hover:bg-brand-red-dark text-white">{submitting ? 'Saving…' : 'Save Inspection'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
