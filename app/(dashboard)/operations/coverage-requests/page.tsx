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
import { AddRegular, CheckmarkCircleRegular, DismissCircleRegular, PeopleRegular } from '@fluentui/react-icons';

interface CoverageRequest { id: string; reason: string; guardsNeeded: number; startDate: string; endDate: string | null; status: string; rejectionReason: string | null; createdAt: string; site: { id: string; name: string }; requestedByUser: { id: string; name: string }; approvedByUser: { name: string } | null }
interface Site { id: string; name: string }
type FormValues = { siteId: string; reason: string; guardsNeeded: string; startDate: string; endDate: string }
type RejectForm = { rejectionReason: string }

const STATUS_STYLES: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', APPROVED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', REJECTED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300', FULFILLED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' }

export default function CoverageRequestsPage() {
  const [requests, setRequests] = useState<CoverageRequest[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<CoverageRequest | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { siteId: '', reason: '', guardsNeeded: '1', startDate: '', endDate: '' },
  })
  const { register: rr, handleSubmit: rSubmit, reset: rReset, formState: { isSubmitting: rSubmitting } } = useForm<RejectForm>()

  async function fetchRequests() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    try {
      const res = await fetch(`/api/operations/coverage-requests?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load coverage requests'); setRequests([]); return }
      setRequests(json.requests ?? [])
    } catch {
      toast.error('Network error loading coverage requests')
      setRequests([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchRequests() }, [filterStatus])
  useEffect(() => {
    fetch('/api/operations/sites').then(r => r.json()).then(j => setSites(j.sites ?? [])).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: FormValues) {
    const res = await fetch('/api/operations/coverage-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, guardsNeeded: Number(data.guardsNeeded), endDate: data.endDate || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Coverage request submitted — managers notified')
    setShowCreateDialog(false); reset(); fetchRequests()
  }

  async function approve(req: CoverageRequest) {
    if (!confirm(`Approve coverage request for ${req.site.name}?`)) return
    setProcessingId(req.id)
    try {
      const res = await fetch(`/api/operations/coverage-requests/${req.id}?action=approve`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Request approved — requester notified')
      fetchRequests()
    } finally { setProcessingId(null) }
  }

  function openReject(req: CoverageRequest) {
    setRejectTarget(req)
    rReset({ rejectionReason: '' })
  }

  async function onReject(data: RejectForm) {
    if (!rejectTarget) return
    const res = await fetch(`/api/operations/coverage-requests/${rejectTarget.id}?action=reject`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectionReason: data.rejectionReason }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Request rejected — requester notified')
    setRejectTarget(null); fetchRequests()
  }

  return (
    <div>
      <PageHeader title="Coverage Requests" description="Manage requests for additional guard coverage" action={<Button type="button" onClick={() => { reset(); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Request</Button>} />

      <div className="mt-4 flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="FULFILLED">Fulfilled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : requests.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No coverage requests" description="Create a request when additional guards are needed at a site" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> New Request</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Guards</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Start</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">End</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Requested By</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{req.site?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px]">
                      <p className="truncate">{req.reason}</p>
                      {req.rejectionReason && <p className="text-xs text-primary mt-0.5">Rejected: {req.rejectionReason}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{req.guardsNeeded}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(req.startDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{req.endDate ? formatDate(new Date(req.endDate)) : <span className="text-brand-muted-light">Open</span>}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status] ?? 'bg-muted text-muted-foreground'}`}>{req.status}</span></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      <p>{req.requestedByUser?.name}</p>
                      {req.approvedByUser && <p className="text-brand-muted-light">(by {req.approvedByUser.name})</p>}
                    </td>
                    <td className="px-4 py-3">
                      {req.status === 'PENDING' && (
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => approve(req)} disabled={processingId === req.id} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600 disabled:opacity-40" aria-label="Approve request">
                            <CheckmarkCircleRegular className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => openReject(req)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Reject request">
                            <DismissCircleRegular className="h-4 w-4" />
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

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Coverage Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Controller control={control} name="siteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5"><Label>Reason *</Label><Textarea placeholder="Why is additional coverage needed?" rows={2} {...register('reason', { required: true })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Guards Needed</Label><Input type="number" min="1" {...register('guardsNeeded')} /></div>
              <div className="space-y-1.5"><Label>From *</Label><Input type="date" {...register('startDate', { required: true })} /></div>
              <div className="space-y-1.5"><Label>To</Label><Input type="date" {...register('endDate')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Submitting…' : 'Submit Request'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Request — {rejectTarget?.site?.name}</DialogTitle></DialogHeader>
          <form onSubmit={rSubmit(onReject)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Textarea placeholder="Explain why this request cannot be fulfilled…" rows={3} {...rr('rejectionReason')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={rSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{rSubmitting ? 'Rejecting…' : 'Reject Request'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
