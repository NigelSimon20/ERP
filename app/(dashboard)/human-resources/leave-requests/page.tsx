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
import { AddRegular, CalendarLtrRegular, CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';

interface LeaveRequest { id: string; leaveType: string; startDate: string; endDate: string | null; days: number; reason: string | null; status: string; rejectionNote: string | null; createdAt: string; guard: { id: string; name: string; employeeNumber: string }; approvedByUser: { name: string } | null }
interface Guard { id: string; name: string; employeeNumber: string }
type CreateForm = { guardId: string; leaveType: string; startDate: string; endDate: string; reason: string }
type RejectForm = { rejectionNote: string }

const STATUS_TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const STATUS_STYLES: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', APPROVED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', REJECTED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY']

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState('ALL')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<CreateForm>({
    defaultValues: { guardId: '', leaveType: 'ANNUAL', startDate: '', endDate: '', reason: '' },
  })
  const { register: rr, handleSubmit: rSubmit, reset: rReset, formState: { isSubmitting: rSubmitting } } = useForm<RejectForm>()

  async function fetchRequests() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusTab !== 'ALL') params.set('status', statusTab)
    try {
      const res = await fetch(`/api/hr/leave?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load leave requests'); setRequests([]); return }
      setRequests(json.leave ?? [])
    } catch {
      toast.error('Network error loading leave requests')
      setRequests([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchRequests() }, [statusTab])
  useEffect(() => {
    fetch('/api/hr/employees').then(r => r.json()).then(j => setGuards(j.guards ?? [])).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: CreateForm) {
    const res = await fetch('/api/hr/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, endDate: data.endDate || data.startDate, reason: data.reason || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Leave request created'); setShowCreateDialog(false); reset(); fetchRequests()
  }

  async function approve(req: LeaveRequest) {
    if (!confirm(`Approve ${req.days}-day leave for ${req.guard.name}?`)) return
    setProcessingId(req.id)
    try {
      const res = await fetch(`/api/hr/leave/${req.id}?action=approve`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Leave approved — attendance records created'); fetchRequests()
    } finally { setProcessingId(null) }
  }

  function openReject(req: LeaveRequest) {
    setRejectTarget(req); rReset({ rejectionNote: '' })
  }

  async function onReject(data: RejectForm) {
    if (!rejectTarget) return
    const res = await fetch(`/api/hr/leave/${rejectTarget.id}?action=reject`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectionNote: data.rejectionNote }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Leave request rejected'); setRejectTarget(null); fetchRequests()
  }

  return (
    <div>
      <PageHeader title="Leave Requests" description="Manage guard leave and time-off requests" action={<Button type="button" onClick={() => { reset(); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Request</Button>} />

      <div className="mt-4 flex gap-1 border-b border-border">
        {STATUS_TABS.map(tab => (
          <button key={tab} type="button" onClick={() => setStatusTab(tab)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${statusTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab}</button>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : requests.length === 0 ? (
          <div className="py-16"><EmptyState icon={CalendarLtrRegular} title="No leave requests" description="No requests match your current filter" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> New Request</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Guard</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Start</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">End</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Days</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{req.guard?.name}</p>
                    <p className="text-xs text-brand-muted-light">{req.guard?.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{req.leaveType}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(req.startDate))}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{req.endDate ? formatDate(new Date(req.endDate)) : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{req.days}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px]">
                    <p className="truncate">{req.reason ?? '—'}</p>
                    {req.rejectionNote && <p className="text-primary mt-0.5 truncate">Rejected: {req.rejectionNote}</p>}
                    {req.approvedByUser && <p className="text-brand-muted-light mt-0.5">By: {req.approvedByUser.name}</p>}
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status] ?? 'bg-muted text-muted-foreground'}`}>{req.status}</span></td>
                  <td className="px-4 py-3">
                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => approve(req)} disabled={processingId === req.id} className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-500/10 text-brand-muted-light hover:text-green-600 dark:hover:text-green-400 disabled:opacity-40" aria-label="Approve leave">
                          <CheckmarkCircleRegular className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openReject(req)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Reject leave">
                          <DismissCircleRegular className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Guard *</Label>
              <Controller control={control} name="guardId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                  <SelectContent>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.employeeNumber})</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Controller control={control} name="leaveType" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start Date *</Label><Input type="date" {...register('startDate', { required: true })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" {...register('endDate')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Reason</Label><Textarea placeholder="Reason for leave request…" rows={2} {...register('reason')} /></div>
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
          <DialogHeader><DialogTitle>Reject Leave — {rejectTarget?.guard?.name}</DialogTitle></DialogHeader>
          <form onSubmit={rSubmit(onReject)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Rejection Note</Label>
              <Textarea placeholder="Reason for rejection…" rows={3} {...rr('rejectionNote')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={rSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{rSubmitting ? 'Rejecting…' : 'Reject Leave'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
