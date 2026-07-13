'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaWhatsapp, FaPlus, FaCheckCircle, FaTimesCircle, FaInbox } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { WhatsAppReminderToggle } from '@/components/tasks/WhatsAppReminderToggle'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface User { id: string; name: string; whatsapp: string | null }
interface Request { id: string; requestType: string; title: string; description: string; requestedBy: string; assignedTo: string | null; priority: string; status: string; approvalNote: string | null; whatsappReminder: boolean; createdAt: string; requestedByUser: User | null; assignedToUser: User | null }
type FormValues = { requestType: string; title: string; description: string; assignedTo: string; priority: string }

const REQUEST_TYPES = ['Leave', 'Equipment', 'Training', 'IT Support', 'Maintenance', 'Finance', 'HR', 'Procurement', 'Other']
const STATUS_STYLES: Record<string, string> = { PENDING: 'bg-gray-100 text-gray-600', IN_REVIEW: 'bg-blue-100 text-blue-700', APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-600', COMPLETED: 'bg-purple-100 text-purple-700' }
const PRIORITY_BADGE: Record<string, string> = { LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'bg-blue-100 text-blue-700', HIGH: 'bg-amber-100 text-amber-700', URGENT: 'bg-red-100 text-red-700' }

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<Request | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [processing, setProcessing] = useState('')
  const [waReminder, setWaReminder] = useState(false)
  const [reminderTime, setReminderTime] = useState<Date | null>(null)
  const [assigneeWa, setAssigneeWa] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { requestType: '', title: '', description: '', assignedTo: '', priority: 'MEDIUM' },
  })
  const watchedAssignee = watch('assignedTo')
  useEffect(() => { setAssigneeWa(users.find(u => u.id === watchedAssignee)?.whatsapp ?? null) }, [watchedAssignee, users])

  async function fetchRequests() {
    setLoading(true)
    const p = new URLSearchParams()
    if (typeFilter) p.set('requestType', typeFilter)
    if (statusFilter) p.set('status', statusFilter)
    try {
      const res = await fetch(`/api/tasks/requests?${p}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load requests'); setRequests([]); return }
      setRequests(json.requests ?? [])
    } catch {
      toast.error('Network error loading requests')
      setRequests([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchRequests() }, [])
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? [])).catch((err) => {
      console.error(err)
      toast.error('Failed to load users')
    })
  }, [])

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/tasks/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, assignedTo: data.assignedTo || null, whatsappReminder: waReminder, reminderTime: reminderTime?.toISOString() ?? null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    if (json.warning) toast(json.warning, { icon: '⚠️' })
    toast.success('Request submitted')
    setShowCreate(false); reset(); setWaReminder(false); setReminderTime(null)
    fetchRequests()
  }

  async function handleApprove(req: Request) {
    setProcessing(req.id)
    try {
      const res = await fetch(`/api/tasks/requests/${req.id}?action=approve`, { method: 'PUT' })
      if (!res.ok) { toast.error('Failed'); return }
      toast.success('Request approved')
      fetchRequests()
    } finally { setProcessing('') }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectNote.trim()) { toast.error('Please provide a reason'); return }
    const res = await fetch(`/api/tasks/requests/${rejectTarget.id}?action=reject`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalNote: rejectNote }),
    })
    if (!res.ok) { toast.error('Failed'); return }
    toast.success('Request rejected')
    setRejectTarget(null); setRejectNote('')
    fetchRequests()
  }

  const filtered = requests.filter(r => (!typeFilter || r.requestType === typeFilter) && (!statusFilter || r.status === statusFilter))

  return (
    <div>
      <PageHeader title="Requests" description="Submit and manage staff requests" action={
        <Button type="button" onClick={() => { reset(); setWaReminder(false); setReminderTime(null); setShowCreate(true) }} className="bg-brand-red hover:bg-brand-red-dark text-white"><FaPlus className="h-4 w-4 mr-1" /> Submit Request</Button>
      } />

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-9 rounded-md border border-gray-300 px-2 text-sm" aria-label="Filter by type">
          <option value="">All Types</option>
          {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-gray-300 px-2 text-sm" aria-label="Filter by status">
          <option value="">All Statuses</option>
          {['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="button" size="sm" variant="outline" onClick={fetchRequests}>Apply</Button>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaInbox} title="No requests" description="Submit a request to get started" action={<Button type="button" onClick={() => setShowCreate(true)} className="bg-brand-red hover:bg-brand-red-dark text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Submit Request</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Requested By</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Priority</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">WA</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Created</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{req.requestType}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0D1B2A]">{req.title}</p>
                    {req.approvalNote && <p className="text-xs text-gray-400 truncate max-w-xs">{req.approvalNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{req.requestedByUser?.name ?? '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[req.priority] ?? ''}`}>{req.priority}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[req.status] ?? ''}`}>{req.status}</span></td>
                  <td className="px-4 py-3 text-center">{req.whatsappReminder && <FaWhatsapp size={14} className="text-[#25D366] mx-auto" />}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(req.createdAt)}</td>
                  <td className="px-4 py-3">
                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleApprove(req)} disabled={processing === req.id} className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 disabled:opacity-50" aria-label="Approve"><FaCheckCircle className="h-4 w-4" /></button>
                        <button type="button" onClick={() => { setRejectTarget(req); setRejectNote('') }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Reject"><FaTimesCircle className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Submit Request Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Submit Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Controller control={control} name="requestType" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{REQUEST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5"><Label>Title *</Label><Input placeholder="Brief title" {...register('title', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Description *</Label><Textarea rows={3} placeholder="Describe your request…" {...register('description', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assign To</Label>
                <Controller control={control} name="assignedTo" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent><SelectItem value="">— None —</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller control={control} name="priority" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <WhatsAppReminderToggle value={waReminder} reminderTime={reminderTime} onToggle={setWaReminder} onTimeChange={setReminderTime} assigneeWhatsApp={assigneeWa} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-brand-red hover:bg-brand-red-dark text-white">{isSubmitting ? 'Submitting…' : 'Submit Request'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Provide a reason for rejecting <strong>{rejectTarget?.title}</strong>.</p>
            <Textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="Reason for rejection…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button type="button" onClick={handleReject} className="bg-red-600 hover:bg-red-700 text-white">Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
