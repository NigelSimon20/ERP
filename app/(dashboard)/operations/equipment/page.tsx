'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, EditRegular, WrenchRegular } from '@fluentui/react-icons';

interface Equipment { id: string; name: string; serialNumber: string | null; category: string; condition: string; status: string; value: number | null; purchaseDate: string | null; notes: string | null; assignedTo: string | null; assignedToGuard: { id: string; name: string } | null; site: { id: string; name: string } | null }
interface Guard { id: string; name: string; employeeNumber: string }
interface Site { id: string; name: string }
type FormValues = { name: string; serialNumber: string; category: string; condition: string; value: string; purchaseDate: string; notes: string }
type AssignValues = { assignedTo: string; siteId: string }

const STATUS_STYLES: Record<string, string> = { AVAILABLE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', ASSIGNED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', REPAIR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', RETIRED: 'bg-muted text-muted-foreground' }
const STATUS_TABS = ['ALL', 'AVAILABLE', 'ASSIGNED', 'REPAIR', 'RETIRED']
const CATEGORIES = ['Radio', 'Torch', 'Handcuffs', 'Baton', 'Uniform', 'Vehicle', 'CCTV', 'Access Control', 'Firearm', 'Other']
const CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR']

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState('ALL')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [assignTarget, setAssignTarget] = useState<Equipment | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', serialNumber: '', category: 'Other', condition: 'GOOD', value: '', purchaseDate: '', notes: '' },
  })
  const { register: ar, handleSubmit: aSubmit, control: aCtrl, reset: aReset, formState: { isSubmitting: aSubmitting } } = useForm<AssignValues>()

  async function fetchEquipment() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusTab !== 'ALL') params.set('status', statusTab)
    try {
      const res = await fetch(`/api/operations/equipment?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load equipment'); setEquipment([]); return }
      setEquipment(json.equipment ?? [])
    } catch {
      toast.error('Network error loading equipment')
      setEquipment([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchEquipment() }, [statusTab])
  useEffect(() => {
    Promise.all([fetch('/api/guards').then(r => r.json()), fetch('/api/operations/sites').then(r => r.json())]).then(([g, s]) => {
      setGuards(g.guards ?? []); setSites(s.sites ?? [])
    }).catch((err) => console.error(err))
  }, [])

  function openCreate() { setEditing(null); reset({ name: '', serialNumber: '', category: 'Other', condition: 'GOOD', value: '', purchaseDate: '', notes: '' }); setShowDialog(true) }
  function openEdit(e: Equipment) { setEditing(e); reset({ name: e.name, serialNumber: e.serialNumber ?? '', category: e.category, condition: e.condition, value: e.value != null ? String(Number(e.value)) : '', purchaseDate: e.purchaseDate?.split('T')[0] ?? '', notes: e.notes ?? '' }); setShowDialog(true) }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/operations/equipment/${editing.id}` : '/api/operations/equipment'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, value: data.value ? Number(data.value) : null, purchaseDate: data.purchaseDate || null }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Equipment updated' : 'Equipment created')
    setShowDialog(false); fetchEquipment()
  }

  async function unassign(e: Equipment) {
    if (!confirm(`Unassign ${e.name}?`)) return
    const res = await fetch(`/api/operations/equipment/${e.id}?action=unassign`, { method: 'PUT' })
    if (!res.ok) { toast.error('Failed'); return }
    toast.success('Equipment unassigned'); fetchEquipment()
  }

  async function onAssign(data: AssignValues) {
    if (!assignTarget) return
    const res = await fetch(`/api/operations/equipment/${assignTarget.id}?action=assign`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: data.assignedTo || null, siteId: data.siteId || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Equipment assigned'); setAssignTarget(null); fetchEquipment()
  }

  async function deleteEquipment(e: Equipment) {
    if (!confirm(`Delete ${e.name}?`)) return
    const res = await fetch(`/api/operations/equipment/${e.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    toast.success('Equipment deleted'); fetchEquipment()
  }

  return (
    <div>
      <PageHeader title="Equipment" description="Manage security equipment inventory" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Equipment</Button>} />

      <div className="mt-4 flex gap-1 border-b border-border">
        {STATUS_TABS.map(tab => (
          <button key={tab} type="button" onClick={() => setStatusTab(tab)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${statusTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab}</button>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : equipment.length === 0 ? (
          <div className="py-16"><EmptyState icon={WrenchRegular} title="No equipment found" description="Add equipment to start tracking your inventory" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Equipment</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Serial</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Assigned To</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Condition</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipment.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                    <td className="px-4 py-3 text-brand-muted-light font-mono text-xs">{e.serialNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.category}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.assignedToGuard?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${e.condition === 'EXCELLENT' || e.condition === 'GOOD' ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' : e.condition === 'FAIR' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-primary/5 text-primary dark:bg-primary/10 dark:text-red-300'}`}>{e.condition}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[e.status] ?? 'bg-muted text-muted-foreground'}`}>{e.status}</span></td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{e.value != null ? formatCurrency(Number(e.value)) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <button type="button" onClick={() => openEdit(e)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit equipment"><EditRegular className="h-3.5 w-3.5" /></button>
                        {e.status === 'AVAILABLE' && <button type="button" onClick={() => { setAssignTarget(e); aReset({ assignedTo: '', siteId: '' }) }} className="text-primary hover:underline" aria-label="Assign equipment">Assign</button>}
                        {e.status === 'ASSIGNED' && <button type="button" onClick={() => unassign(e)} className="text-amber-600 dark:text-amber-400 hover:underline" aria-label="Unassign equipment">Unassign</button>}
                        <button type="button" onClick={() => deleteEquipment(e)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Delete equipment"><DeleteRegular className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Equipment' : 'New Equipment'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Motorola Radio" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Controller control={control} name="category" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Controller control={control} name="condition" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Serial Number</Label><Input placeholder="Optional" {...register('serialNumber')} /></div>
              <div className="space-y-1.5"><Label>Value</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('value')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" {...register('purchaseDate')} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Optional notes" {...register('notes')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Equipment'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign — {assignTarget?.name}</DialogTitle></DialogHeader>
          <form onSubmit={aSubmit(onAssign)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Guard</Label>
              <Controller control={aCtrl} name="assignedTo" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                  <SelectContent><SelectItem value="">— No guard —</SelectItem>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.employeeNumber})</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Controller control={aCtrl} name="siteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent><SelectItem value="">— No site —</SelectItem>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={aSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{aSubmitting ? 'Assigning…' : 'Assign'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
