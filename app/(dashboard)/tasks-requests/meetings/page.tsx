'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaWhatsapp, FaPlus, FaCheckSquare, FaCalendarAlt } from 'react-icons/fa'
import { MdClose } from 'react-icons/md'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { WhatsAppReminderToggle } from '@/components/tasks/WhatsAppReminderToggle'
import { formatDate, formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

interface User { id: string; name: string; whatsapp: string | null }
interface AttendeeUser { id: string; userId: string; attendanceStatus: string; user: User | null }
interface Meeting { id: string; title: string; description: string | null; location: string | null; meetingDate: string; startTime: string; endTime: string; status: string; notes: string | null; whatsappReminder: boolean; organizerId: string; organizerUser: User | null; attendeeUsers: AttendeeUser[] }
type MeetingForm = { title: string; description: string; meetingDate: string; startTime: string; endTime: string; location: string }

const STATUS_BADGE: Record<string, string> = { SCHEDULED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-500' }

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [completeTarget, setCompleteTarget] = useState<Meeting | null>(null)
  const [completionNotes, setCompletionNotes] = useState('')
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null)
  const [processing, setProcessing] = useState('')
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [waReminder, setWaReminder] = useState(false)
  const [reminderTime, setReminderTime] = useState<Date | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<MeetingForm>({
    defaultValues: { title: '', description: '', meetingDate: '', startTime: '', endTime: '', location: '' },
  })

  async function fetchMeetings() {
    setLoading(true)
    const p = new URLSearchParams()
    if (statusFilter) p.set('status', statusFilter)
    try {
      const res = await fetch(`/api/tasks/meetings?${p}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load meetings'); setMeetings([]); return }
      setMeetings(json.meetings ?? [])
    } catch {
      toast.error('Network error loading meetings')
      setMeetings([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchMeetings() }, [statusFilter])
  useEffect(() => { fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? [])).catch((err) => console.error(err)) }, [])

  async function onCreate(data: MeetingForm) {
    const meetingDateISO = new Date(data.meetingDate).toISOString()
    const startISO = new Date(`${data.meetingDate}T${data.startTime}`).toISOString()
    const endISO = new Date(`${data.meetingDate}T${data.endTime}`).toISOString()

    const res = await fetch('/api/tasks/meetings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, meetingDate: meetingDateISO, startTime: startISO, endTime: endISO, attendeeIds, whatsappReminder: waReminder, reminderTime: reminderTime?.toISOString() ?? null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Meeting scheduled')
    setShowCreate(false); reset(); setAttendeeIds([]); setWaReminder(false); setReminderTime(null)
    fetchMeetings()
  }

  async function completeMeeting() {
    if (!completeTarget) return
    setProcessing(completeTarget.id)
    const res = await fetch(`/api/tasks/meetings/${completeTarget.id}?action=complete`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: completionNotes }),
    })
    if (!res.ok) { toast.error('Failed'); return }
    toast.success('Meeting marked as completed')
    setCompleteTarget(null); setCompletionNotes(''); setProcessing('')
    fetchMeetings()
  }

  async function cancelMeeting(meeting: Meeting) {
    if (!confirm(`Cancel "${meeting.title}"? All attendees will be notified.`)) return
    setProcessing(meeting.id)
    const res = await fetch(`/api/tasks/meetings/${meeting.id}?action=cancel`, { method: 'PUT' })
    if (!res.ok) { toast.error('Failed'); return }
    toast.success('Meeting cancelled'); setProcessing('')
    fetchMeetings()
  }

  function toggleAttendee(uid: string) {
    setAttendeeIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  return (
    <div>
      <PageHeader title="Meetings" description="Schedule and manage team meetings" action={
        <Button type="button" onClick={() => { reset(); setAttendeeIds([]); setWaReminder(false); setReminderTime(null); setShowCreate(true) }} className="bg-brand-red hover:bg-brand-red-dark text-white"><FaPlus className="h-4 w-4 mr-1" /> Schedule Meeting</Button>
      } />

      <div className="mt-4 flex items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-gray-300 px-2 text-sm" aria-label="Filter by status">
          <option value="">All Statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : meetings.length === 0 ? (
          <div className="py-16 bg-white"><EmptyState icon={FaCalendarAlt} title="No meetings" description="Schedule a meeting to get started" action={<Button type="button" onClick={() => setShowCreate(true)} className="bg-brand-red hover:bg-brand-red-dark text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Schedule Meeting</Button>} /></div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-sm min-w-[800px] bg-white">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Time</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Location</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Organizer</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Attendees</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">WA</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0D1B2A]">{m.title}</p>
                    {m.notes && <p className="text-xs text-gray-400 truncate max-w-[200px]">{m.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(m.meetingDate)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(m.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.location ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{m.organizerUser?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    <span title={m.attendeeUsers.map(a => a.user?.name).filter(Boolean).join(', ')} className="cursor-default">
                      {m.attendeeUsers.length} attendee{m.attendeeUsers.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[m.status] ?? ''}`}>{m.status}</span></td>
                  <td className="px-4 py-3 text-center">{m.whatsappReminder && <FaWhatsapp size={14} className="text-[#25D366] mx-auto" />}</td>
                  <td className="px-4 py-3">
                    {m.status === 'SCHEDULED' && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => { setCompleteTarget(m); setCompletionNotes('') }} className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600" aria-label="Complete"><FaCheckSquare className="h-4 w-4" /></button>
                        <button type="button" onClick={() => cancelMeeting(m)} disabled={processing === m.id} className="p-1 rounded hover:bg-brand-red/10 text-gray-400 hover:text-brand-red disabled:opacity-50" aria-label="Cancel"><MdClose className="h-4 w-4" /></button>
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

      {/* Create Meeting Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white border border-gray-200 shadow-lg">
          <DialogHeader><DialogTitle>Schedule Meeting</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5"><Label>Title *</Label><Input placeholder="Meeting title" {...register('title', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} placeholder="Agenda or details…" {...register('description')} /></div>
            <div className="space-y-1.5"><Label>Date *</Label><Input type="date" {...register('meetingDate', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start Time *</Label><Input type="time" {...register('startTime', { required: true })} /></div>
              <div className="space-y-1.5"><Label>End Time *</Label><Input type="time" {...register('endTime', { required: true })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Location</Label><Input placeholder="Room, address, or video link" {...register('location')} /></div>

            {/* Attendees */}
            <div className="space-y-2">
              <Label>Attendees</Label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md divide-y">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={attendeeIds.includes(u.id)} onChange={() => toggleAttendee(u.id)} className="accent-[#CC0000]" />
                    <span>{u.name}</span>
                    {u.whatsapp && <FaWhatsapp size={12} className="text-[#25D366] ml-auto" />}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400">{attendeeIds.length} selected · You will be added automatically</p>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <WhatsAppReminderToggle value={waReminder} reminderTime={reminderTime} onToggle={setWaReminder} onTimeChange={setReminderTime} assigneeWhatsApp={null} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-brand-red hover:bg-brand-red-dark text-white">{isSubmitting ? 'Scheduling…' : 'Schedule Meeting'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Complete Meeting Dialog */}
      <Dialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <DialogContent className="max-w-sm bg-white border border-gray-200 shadow-lg">
          <DialogHeader><DialogTitle>Complete Meeting</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Add meeting notes / minutes for <strong>{completeTarget?.title}</strong>.</p>
            <Textarea rows={4} placeholder="Minutes, decisions, action items…" value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button type="button" onClick={completeMeeting} disabled={!!processing} className="bg-green-600 hover:bg-green-700 text-white">{processing ? 'Saving…' : 'Mark Complete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
