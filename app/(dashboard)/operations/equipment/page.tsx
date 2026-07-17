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
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, EditRegular, WrenchRegular } from '@fluentui/react-icons';

interface Equipment { id: string; code: string | null; name: string | null; equipmentClass: string | null; category: string | null; quantityInStock: number | null; quantityIssued: number | null; quantityDamaged: number | null; quantityLost: number | null; unitCost: number | null; location: string | null; isActive: boolean | null; notes: string | null }
type FormValues = { name: string; code: string; equipmentClass: string; category: string; quantityInStock: string; quantityIssued: string; quantityDamaged: string; quantityLost: string; unitCost: string; location: string; notes: string; isActive: string }

const BLANK: FormValues = { name: '', code: '', equipmentClass: '', category: '', quantityInStock: '0', quantityIssued: '0', quantityDamaged: '0', quantityLost: '0', unitCost: '', location: '', notes: '', isActive: 'true' }

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Equipment | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({ defaultValues: BLANK })

  async function fetchEquipment() {
    setLoading(true)
    const params = new URLSearchParams()
    if (activeTab !== 'ALL') params.set('active', activeTab === 'ACTIVE' ? 'true' : 'false')
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

  useEffect(() => { fetchEquipment() }, [activeTab])

  function openCreate() { setEditing(null); reset(BLANK); setShowDialog(true) }
  function openEdit(e: Equipment) {
    setEditing(e)
    reset({
      name: e.name ?? '', code: e.code ?? '', equipmentClass: e.equipmentClass ?? '', category: e.category ?? '',
      quantityInStock: String(e.quantityInStock ?? 0), quantityIssued: String(e.quantityIssued ?? 0),
      quantityDamaged: String(e.quantityDamaged ?? 0), quantityLost: String(e.quantityLost ?? 0),
      unitCost: e.unitCost != null ? String(Number(e.unitCost)) : '', location: e.location ?? '', notes: e.notes ?? '',
      isActive: e.isActive === false ? 'false' : 'true',
    })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/operations/equipment/${editing.id}` : '/api/operations/equipment'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        quantityInStock: Number(data.quantityInStock) || 0,
        quantityIssued: Number(data.quantityIssued) || 0,
        quantityDamaged: Number(data.quantityDamaged) || 0,
        quantityLost: Number(data.quantityLost) || 0,
        unitCost: data.unitCost ? Number(data.unitCost) : null,
        isActive: data.isActive === 'true',
      }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Equipment updated' : 'Equipment created')
    setShowDialog(false); fetchEquipment()
  }

  async function deleteEquipment(e: Equipment) {
    if (!confirm(`Delete ${e.name}?`)) return
    const res = await fetch(`/api/operations/equipment/${e.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    toast.success('Equipment deleted'); fetchEquipment()
  }

  return (
    <div>
      <PageHeader title="Equipment" description="Manage security equipment stock" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Equipment</Button>} />

      <div className="mt-4 flex gap-1 border-b border-border">
        {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab === 'ALL' ? 'All' : tab === 'ACTIVE' ? 'Active' : 'Inactive'}</button>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : equipment.length === 0 ? (
          <div className="py-16"><EmptyState icon={WrenchRegular} title="No equipment found" description="Add equipment to start tracking your inventory" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Equipment</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Code</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Class</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">In Stock</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Issued</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Lost/Damaged</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Unit Cost</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipment.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-brand-muted-light font-mono text-xs">{e.code ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.equipmentClass ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.category ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-foreground">{e.quantityInStock ?? 0}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{e.quantityIssued ?? 0}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{(e.quantityLost ?? 0) + (e.quantityDamaged ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{e.unitCost != null ? formatCurrency(Number(e.unitCost)) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${e.isActive === false ? 'bg-muted text-muted-foreground' : 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'}`}>{e.isActive === false ? 'Inactive' : 'Active'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <button type="button" onClick={() => openEdit(e)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit equipment"><EditRegular className="h-3.5 w-3.5" /></button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Equipment' : 'New Equipment'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Motorola Radio" {...register('name', { required: true })} /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input placeholder="Equipment code" {...register('code')} /></div>
              <div className="space-y-1.5"><Label>Class</Label><Input placeholder="e.g. Uniform, Weapon, Safety" {...register('equipmentClass')} /></div>
              <div className="space-y-1.5"><Label>Category</Label><Input placeholder="e.g. Torch, Helmet, Trousers" {...register('category')} /></div>
              <div className="space-y-1.5"><Label>Location</Label><Input placeholder="Storage location" {...register('location')} /></div>
              <div className="space-y-1.5"><Label>In Stock</Label><Input type="number" min="0" {...register('quantityInStock')} /></div>
              <div className="space-y-1.5"><Label>Issued</Label><Input type="number" min="0" {...register('quantityIssued')} /></div>
              <div className="space-y-1.5"><Label>Damaged</Label><Input type="number" min="0" {...register('quantityDamaged')} /></div>
              <div className="space-y-1.5"><Label>Lost</Label><Input type="number" min="0" {...register('quantityLost')} /></div>
              <div className="space-y-1.5"><Label>Unit Cost</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('unitCost')} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller control={control} name="isActive" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">Active</SelectItem><SelectItem value="false">Inactive</SelectItem></SelectContent>
                  </Select>
                )} />
              </div>
              <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Input placeholder="Optional notes" {...register('notes')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Equipment'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
