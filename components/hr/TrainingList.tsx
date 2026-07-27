'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { AddRegular as Plus, BookOpenRegular as BookOpen, CalendarLtrRegular as Calendar, DeleteRegular as Trash2, EditRegular as Edit2, PeopleRegular as Users } from '@fluentui/react-icons';

interface Training {
  id: string
  title: string
  category: string
  startDate: string
  endDate: string
  status: string
  mandatory: boolean
  durationHours: number
  trainer?: string
  location?: string
  description?: string
  notes?: string
  participants?: any[]
}

type FormState = {
  title: string; category: string; trainer: string; location: string
  startDate: string; endDate: string; durationHours: string
  mandatory: boolean; description: string; notes: string
}

const EMPTY_FORM: FormState = {
  title: '', category: '', trainer: '', location: '',
  startDate: '', endDate: '', durationHours: '',
  mandatory: false, description: '', notes: '',
}

function toDateInput(iso: string) {
  return iso ? iso.slice(0, 10) : ''
}

export function TrainingList() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Training | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    fetchTrainings()
  }, [page])

  const fetchTrainings = async () => {
    try {
      const res = await fetch(`/api/hr/trainings?page=${page}`)
      const data = await res.json()
      setTrainings(data.trainings)
    } catch (err) {
      console.error('Failed to fetch trainings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return
    try {
      await fetch(`/api/hr/trainings/${id}`, { method: 'DELETE' })
      fetchTrainings()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowDialog(true)
  }

  function openEdit(training: Training) {
    setEditing(training)
    setForm({
      title: training.title, category: training.category,
      trainer: training.trainer ?? '', location: training.location ?? '',
      startDate: toDateInput(training.startDate), endDate: toDateInput(training.endDate),
      durationHours: String(training.durationHours ?? ''),
      mandatory: training.mandatory, description: training.description ?? '', notes: training.notes ?? '',
    })
    setShowDialog(true)
  }

  async function onSubmit() {
    if (!form.title || !form.category || !form.startDate || !form.endDate) {
      toast.error('Title, category, start date, and end date are required')
      return
    }
    setSaving(true)
    try {
      const url = editing ? `/api/hr/trainings/${editing.id}` : '/api/hr/trainings'
      const method = editing ? 'PUT' : 'POST'
      const payload = {
        title: form.title, category: form.category,
        trainer: form.trainer || undefined, location: form.location || undefined,
        startDate: form.startDate, endDate: form.endDate,
        durationHours: form.durationHours ? Number(form.durationHours) : 0,
        mandatory: form.mandatory, description: form.description || undefined, notes: form.notes || undefined,
      }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to save training'); return }
      toast.success(editing ? 'Training updated' : 'Training created')
      setShowDialog(false)
      fetchTrainings()
    } finally {
      setSaving(false)
    }
  }

  const getStatusColor = (status: string) => {
    return {
      SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
      IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
      COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
      CANCELLED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
    }[status] || 'bg-muted text-foreground'
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Training Programs</h2>
        <Button className="flex gap-2" onClick={openCreate}>
          <Plus fontSize={18} />
          New Training
        </Button>
      </div>

      <div className="grid gap-4">
        {trainings.map((training) => (
          <Card key={training.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{training.title}</CardTitle>
                  <CardDescription>{training.category}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className={getStatusColor(training.status)}>
                    {training.status}
                  </Badge>
                  {training.mandatory && <Badge variant="outline">Mandatory</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar fontSize={16} className="text-muted-foreground" />
                  <span>{new Date(training.startDate).toLocaleDateString()} - {new Date(training.endDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen fontSize={16} className="text-muted-foreground" />
                  <span>{training.durationHours} hours</span>
                </div>
                {training.trainer && <div><strong>Trainer:</strong> {training.trainer}</div>}
                {training.location && <div><strong>Location:</strong> {training.location}</div>}
                <div className="flex items-center gap-2">
                  <Users fontSize={16} className="text-muted-foreground" />
                  <span>{training.participants?.length || 0} Participants</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex gap-2" onClick={() => openEdit(training)}>
                  <Edit2 fontSize={16} />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex gap-2"
                  onClick={() => handleDelete(training.id)}
                >
                  <Trash2 fontSize={16} />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Training' : 'New Training'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tr-title">Title *</Label>
              <Input id="tr-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Firearms Certification" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tr-category">Category *</Label>
                <Input id="tr-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Compliance" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-duration">Duration (hours)</Label>
                <Input id="tr-duration" type="number" min="0" step="0.5" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tr-start">Start Date *</Label>
                <Input id="tr-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-end">End Date *</Label>
                <Input id="tr-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tr-trainer">Trainer</Label>
                <Input id="tr-trainer" value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-location">Location</Label>
                <Input id="tr-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-notes">Notes</Label>
              <Input id="tr-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} />
              Mandatory
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={onSubmit} className="bg-primary hover:bg-brand-red-dark text-white">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Training'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
