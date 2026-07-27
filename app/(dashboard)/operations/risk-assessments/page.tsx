'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ShieldRegular } from '@fluentui/react-icons'

interface RiskAssessment {
  id: string
  category: string
  likelihood: string
  impact: string
  riskRating: string
  findings: string
  status: string
  assessedAt: string
  site: { id: string; name: string } | null
}
interface Site { id: string; name: string }
type FormValues = { siteId: string; category: string; likelihood: string; impact: string; riskRating: string; findings: string; mitigationPlan: string; reviewDate: string }

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

export default function RiskAssessmentsPage() {
  const [rows, setRows] = useState<RiskAssessment[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { siteId: '', category: '', likelihood: 'MEDIUM', impact: 'MEDIUM', riskRating: 'MEDIUM', findings: '', mitigationPlan: '', reviewDate: '' },
  })

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/operations/risk-assessments')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load risk assessments'); setRows([]); return }
      setRows(json.riskAssessments ?? [])
    } catch { toast.error('Network error loading risk assessments'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => { fetch('/api/operations/sites').then((r) => r.json()).then((j) => setSites(j.sites ?? j ?? [])).catch((err) => console.error(err)) }, [])

  async function onCreate(data: FormValues) {
    const res = await fetch('/api/operations/risk-assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Risk assessment recorded')
    setShowCreateDialog(false)
    reset({ siteId: '', category: '', likelihood: 'MEDIUM', impact: 'MEDIUM', riskRating: 'MEDIUM', findings: '', mitigationPlan: '', reviewDate: '' })
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Risk Assessments"
        description="Formal risk assessments for sites and operations"
        action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Assessment</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={ShieldRegular} title="No risk assessments found" description="Record your first risk assessment" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Assessed</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Risk Rating</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{row.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.assessedAt))}</td>
                    <td className="px-4 py-3"><RatingBadge rating={row.riskRating} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Risk Assessment</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Controller control={control} name="siteId" rules={{ required: true }} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <input className="w-full h-9 rounded-md border border-border px-3 text-sm bg-background" placeholder="e.g. Physical Security, Fire, Access Control" {...register('category', { required: true })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['likelihood', 'impact', 'riskRating'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="capitalize">{field === 'riskRating' ? 'Risk Rating' : field}</Label>
                  <Controller control={control} name={field} render={({ field: f }) => (
                    <Select onValueChange={f.onChange} value={f.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Findings *</Label>
              <Textarea placeholder="What was found during the assessment?" {...register('findings', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Mitigation Plan *</Label>
              <Textarea placeholder="How will identified risks be mitigated?" {...register('mitigationPlan', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Review Date</Label>
              <input type="date" className="w-full h-9 rounded-md border border-border px-3 text-sm bg-background" {...register('reviewDate')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Save Assessment'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
