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
import { AddRegular, CheckmarkCircleRegular, ClockRegular, DismissCircleRegular } from '@fluentui/react-icons'

interface OvertimeRequest {
  id: string
  date: string
  hoursRequested: number
  reason: string | null
  status: string
  rejectionNote: string | null
  guard: { id: string; name: string }
}
interface Guard { id: string; name: string; employeeNumber: string }
type CreateForm = { guardId: string; date: string; hoursRequested: string; reason: string }
type RejectForm = { rejectionNote: string }

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  REJECTED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
}
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status}</span>
}

export default function OvertimePage() {
  const [rows, setRows] = useState<OvertimeRequest[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<OvertimeRequest | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<CreateForm>({ defaultValues: { guardId: '', date: '', hoursRequested: '', reason: '' } })
  const { register: rr, handleSubmit: rSubmit, reset: rReset } = useForm<RejectForm>({ defaultValues: { rejectionNote: '' } })

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/hr/overtime')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load overtime requests'); setRows([]); return }
      setRows(json.overtimeRequests ?? [])
    } catch { toast.error('Network error loading overtime requests'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => { fetch('/api/hr/employees').then((r) => r.json()).then((j) => setGuards(j.guards ?? [])).catch((err) => console.error(err)) }, [])

  async function onCreate(data: CreateForm) {
    const res = await fetch('/api/hr/overtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, hoursRequested: Number(data.hoursRequested) }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Overtime request submitted')
    setShowCreateDialog(false)
    reset({ guardId: '', date: '', hoursRequested: '', reason: '' })
    fetchRows()
  }

  async function approve(row: OvertimeRequest) {
    setProcessingId(row.id)
    try {
      const res = await fetch(`/api/hr/overtime/${row.id}?action=approve`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Overtime approved')
      fetchRows()
    } finally { setProcessingId(null) }
  }

  function openReject(row: OvertimeRequest) { setRejectTarget(row); rReset({ rejectionNote: '' }) }

  async function onReject(data: RejectForm) {
    if (!rejectTarget) return
    const res = await fetch(`/api/hr/overtime/${rejectTarget.id}?action=reject`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Overtime request rejected')
    setRejectTarget(null)
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Overtime Requests"
        description="Submit and approve overtime hours — approved hours feed straight into payroll"
        action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Request</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={ClockRegular} title="No overtime requests found" description="Submit your first overtime request" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Guard</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Hours</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{row.guard?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.date))}</td>
                    <td className="px-4 py-3 text-right font-medium">{row.hoursRequested}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                      {row.reason || '—'}
                      {row.rejectionNote && <p className="text-primary mt-0.5">Rejected: {row.rejectionNote}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      {row.status === 'PENDING' && (
                        <div className="flex items-center gap-2">
                          <button type="button" disabled={processingId === row.id} onClick={() => approve(row)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600 disabled:opacity-40" title="Approve" aria-label="Approve overtime">
                            <CheckmarkCircleRegular className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => openReject(row)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Reject" aria-label="Reject overtime">
                            <DismissCircleRegular className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Overtime Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Guard *</Label>
              <Controller control={control} name="guardId" rules={{ required: true }} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                  <SelectContent>{guards.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.employeeNumber})</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" {...register('date', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hours *</Label>
              <Input type="number" step="0.5" min="0.5" {...register('hoursRequested', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea placeholder="Optional reason" {...register('reason')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Submitting…' : 'Submit Request'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject Overtime — {rejectTarget?.guard?.name}</DialogTitle></DialogHeader>
          <form onSubmit={rSubmit(onReject)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea placeholder="Reason for rejection…" rows={3} {...rr('rejectionNote')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button type="submit" className="bg-primary hover:bg-brand-red-dark text-white">Reject</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
