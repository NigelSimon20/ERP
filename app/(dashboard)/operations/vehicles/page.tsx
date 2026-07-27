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
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, EditRegular, VehicleCarRegular, WrenchRegular } from '@fluentui/react-icons'

interface Vehicle { id: string; registrationNumber: string; make: string | null; model: string | null; assignedSiteId: string | null; assignedGuardId: string | null; siteName: string | null; guardName: string | null; status: string }
interface SiteOption { id: string; name: string }
interface GuardOption { id: string; name: string | null }
interface Inspection { id: string; inspectedAt: string; odometer: number | null; fuelLevel: string | null; condition: string; defectsNoted: string | null }
type FormValues = { registrationNumber: string; make: string; model: string; assignedSiteId: string; assignedGuardId: string; status: string }

const BLANK: FormValues = { registrationNumber: '', make: '', model: '', assignedSiteId: '', assignedGuardId: '', status: 'ACTIVE' }
const CONDITION_STYLES: Record<string, string> = { GOOD: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', NEEDS_ATTENTION: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', UNSAFE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [sites, setSites] = useState<SiteOption[]>([])
  const [guards, setGuards] = useState<GuardOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)

  const [inspectTarget, setInspectTarget] = useState<Vehicle | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [odometer, setOdometer] = useState('')
  const [fuelLevel, setFuelLevel] = useState('')
  const [condition, setCondition] = useState<'GOOD' | 'NEEDS_ATTENTION' | 'UNSAFE'>('GOOD')
  const [defectsNoted, setDefectsNoted] = useState('')
  const [inspecting, setInspecting] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({ defaultValues: BLANK })

  async function fetchVehicles() {
    setLoading(true)
    try {
      const res = await fetch('/api/operations/vehicles')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load vehicles'); setVehicles([]); return }
      setVehicles(json.vehicles ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchVehicles() }, [])
  useEffect(() => {
    fetch('/api/operations/sites').then(r => r.json()).then(j => setSites((j.sites ?? []).map((s: any) => ({ id: s.id, name: s.name ?? s.site_name })))).catch(() => {})
    fetch('/api/hr/employees').then(r => r.json()).then(j => setGuards(j.guards ?? [])).catch(() => {})
  }, [])

  function openCreate() { setEditing(null); reset(BLANK); setShowDialog(true) }
  function openEdit(v: Vehicle) {
    setEditing(v)
    reset({ registrationNumber: v.registrationNumber, make: v.make ?? '', model: v.model ?? '', assignedSiteId: v.assignedSiteId ?? '', assignedGuardId: v.assignedGuardId ?? '', status: v.status })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/operations/vehicles/${editing.id}` : '/api/operations/vehicles'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Vehicle updated' : 'Vehicle added')
    setShowDialog(false); fetchVehicles()
  }

  async function deleteVehicle(v: Vehicle) {
    if (!confirm(`Delete vehicle ${v.registrationNumber}?`)) return
    const res = await fetch(`/api/operations/vehicles/${v.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    toast.success('Vehicle deleted'); fetchVehicles()
  }

  async function openInspect(v: Vehicle) {
    setInspectTarget(v)
    setOdometer(''); setFuelLevel(''); setCondition('GOOD'); setDefectsNoted('')
    const res = await fetch(`/api/operations/vehicles/${v.id}/inspect`)
    const json = await res.json()
    if (res.ok) setInspections(json.inspections ?? [])
  }

  async function submitInspection() {
    if (!inspectTarget) return
    setInspecting(true)
    try {
      const res = await fetch(`/api/operations/vehicles/${inspectTarget.id}/inspect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odometer: odometer ? Number(odometer) : undefined, fuelLevel: fuelLevel || undefined, condition, defectsNoted: defectsNoted || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to log inspection'); return }
      toast.success('Inspection logged')
      setOdometer(''); setFuelLevel(''); setDefectsNoted('')
      const listRes = await fetch(`/api/operations/vehicles/${inspectTarget.id}/inspect`)
      const listJson = await listRes.json()
      if (listRes.ok) setInspections(listJson.inspections ?? [])
    } finally { setInspecting(false) }
  }

  return (
    <div>
      <PageHeader title="Vehicles" description="Manage the vehicle fleet and inspection records" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Vehicle</Button>} />

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : vehicles.length === 0 ? (
          <div className="py-16"><EmptyState icon={VehicleCarRegular} title="No vehicles" description="Add a vehicle to start tracking inspections" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Vehicle</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Registration</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Make / Model</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Assigned Guard</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{v.registrationNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{v.siteName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{v.guardName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${v.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>{v.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <button type="button" onClick={() => openInspect(v)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Log inspection"><WrenchRegular className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => openEdit(v)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit vehicle"><EditRegular className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteVehicle(v)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Delete vehicle"><DeleteRegular className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Vehicle' : 'New Vehicle'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Registration Number *</Label><Input placeholder="e.g. ABC 1234" {...register('registrationNumber', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Make</Label><Input placeholder="e.g. Toyota" {...register('make')} /></div>
              <div className="space-y-1.5"><Label>Model</Label><Input placeholder="e.g. Hilux" {...register('model')} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned Site</Label>
              <Controller control={control} name="assignedSiteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Assigned Guard</Label>
              <Controller control={control} name="assignedGuardId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            {editing && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller control={control} name="status" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="IN_MAINTENANCE">In Maintenance</SelectItem><SelectItem value="DECOMMISSIONED">Decommissioned</SelectItem></SelectContent>
                  </Select>
                )} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Vehicle'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inspectTarget} onOpenChange={(o) => !o && setInspectTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Inspections — {inspectTarget?.registrationNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Log New Inspection</p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" min="0" placeholder="Odometer (km)" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
                <Input placeholder="Fuel level (e.g. 3/4)" value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)} />
              </div>
              <select value={condition} onChange={(e) => setCondition(e.target.value as any)} className="w-full h-9 rounded-md border border-border px-2 text-sm bg-background" aria-label="Condition">
                <option value="GOOD">Good</option>
                <option value="NEEDS_ATTENTION">Needs Attention</option>
                <option value="UNSAFE">Unsafe</option>
              </select>
              <Input placeholder="Defects noted (optional)" value={defectsNoted} onChange={(e) => setDefectsNoted(e.target.value)} />
              <Button type="button" size="sm" disabled={inspecting} onClick={submitInspection} className="bg-primary hover:bg-brand-red-dark text-white w-full">{inspecting ? 'Saving…' : 'Log Inspection'}</Button>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">History</p>
              {inspections.length === 0 ? (
                <p className="text-sm text-brand-muted-light text-center py-4">No inspections logged yet</p>
              ) : (
                <div className="space-y-2">
                  {inspections.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="text-xs text-brand-muted-light">{formatDateTime(i.inspectedAt)}{i.odometer != null ? ` · ${i.odometer} km` : ''}{i.fuelLevel ? ` · Fuel: ${i.fuelLevel}` : ''}</p>
                        {i.defectsNoted && <p className="text-xs text-muted-foreground mt-0.5">{i.defectsNoted}</p>}
                      </div>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ml-2 ${CONDITION_STYLES[i.condition] ?? ''}`}>{i.condition.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInspectTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
