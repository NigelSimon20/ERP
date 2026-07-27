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
import { AddRegular, ArrowSwapRegular, DeleteRegular, EditRegular, WrenchRegular } from '@fluentui/react-icons';

interface Equipment { id: string; code: string | null; name: string | null; equipmentClass: string | null; category: string | null; quantityInStock: number | null; quantityIssued: number | null; quantityDamaged: number | null; quantityLost: number | null; unitCost: number | null; location: string | null; isActive: boolean | null; notes: string | null }
type FormValues = { name: string; code: string; equipmentClass: string; category: string; quantityInStock: string; unitCost: string; location: string; notes: string; isActive: string }
type GuardOption = { id: string; name: string | null }
interface EquipmentIssueRow {
  id: string; guardId: string; quantity: number; serialNumber: string | null
  condition: string; issuedAt: string; returnedAt: string | null; returnCondition: string | null
  guard: { full_name?: string | null; employee_code?: string | null } | null
}

const BLANK: FormValues = { name: '', code: '', equipmentClass: '', category: '', quantityInStock: '0', unitCost: '', location: '', notes: '', isActive: 'true' }

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Equipment | null>(null)
  const [guards, setGuards] = useState<GuardOption[]>([])

  const [issueTarget, setIssueTarget] = useState<Equipment | null>(null)
  const [issues, setIssues] = useState<EquipmentIssueRow[]>([])
  const [issueGuardId, setIssueGuardId] = useState('')
  const [issueQuantity, setIssueQuantity] = useState('1')
  const [issueSerial, setIssueSerial] = useState('')
  const [issuing, setIssuing] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({ defaultValues: BLANK })

  useEffect(() => {
    fetch('/api/hr/employees').then((r) => r.json()).then((j) => setGuards(j.guards ?? [])).catch(() => {})
  }, [])

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
      quantityInStock: String(e.quantityInStock ?? 0),
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

  async function openIssuePanel(e: Equipment) {
    setIssueTarget(e)
    setIssueGuardId(''); setIssueQuantity('1'); setIssueSerial('')
    await loadIssues(e.id)
  }

  async function loadIssues(equipmentId: string) {
    const res = await fetch(`/api/operations/equipment/${equipmentId}/issues`)
    const json = await res.json()
    if (res.ok) setIssues(json.issues ?? [])
  }

  async function submitIssue() {
    if (!issueTarget) return
    if (!issueGuardId) { toast.error('Select a guard'); return }
    setIssuing(true)
    try {
      const res = await fetch(`/api/operations/equipment/${issueTarget.id}/issue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardId: issueGuardId, quantity: Number(issueQuantity) || 1, serialNumber: issueSerial || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to issue equipment'); return }
      toast.success('Equipment issued')
      setIssueGuardId(''); setIssueQuantity('1'); setIssueSerial('')
      await loadIssues(issueTarget.id)
      fetchEquipment()
    } finally {
      setIssuing(false)
    }
  }

  async function returnIssue(issue: EquipmentIssueRow, returnCondition: 'GOOD' | 'DAMAGED' | 'LOST') {
    if (!issueTarget) return
    const res = await fetch(`/api/operations/equipment/issues/${issue.id}/return`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnCondition }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to process return'); return }
    toast.success('Return recorded')
    await loadIssues(issueTarget.id)
    fetchEquipment()
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
                        <button type="button" onClick={() => openIssuePanel(e)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Issue / return"><ArrowSwapRegular className="h-3.5 w-3.5" /></button>
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

      {/* Issue / Return panel */}
      <Dialog open={!!issueTarget} onOpenChange={(o) => !o && setIssueTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Issue / Return — {issueTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issue to a guard</p>
              <div className="grid grid-cols-3 gap-2">
                <select value={issueGuardId} onChange={(e) => setIssueGuardId(e.target.value)} className="col-span-2 h-9 rounded-md border border-border px-2 text-sm bg-background" aria-label="Guard">
                  <option value="">Select guard…</option>
                  {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <Input type="number" min="1" step="1" value={issueQuantity} onChange={(e) => setIssueQuantity(e.target.value)} aria-label="Quantity" />
              </div>
              <Input placeholder="Serial number (optional)" value={issueSerial} onChange={(e) => setIssueSerial(e.target.value)} />
              <Button type="button" size="sm" disabled={issuing} onClick={submitIssue} className="bg-primary hover:bg-brand-red-dark text-white w-full">{issuing ? 'Issuing…' : 'Issue'}</Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Issue history</p>
              {issues.length === 0 ? (
                <p className="text-sm text-brand-muted-light text-center py-4">No units issued yet</p>
              ) : (
                <div className="space-y-2">
                  {issues.map((i) => (
                    <div key={i.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{i.guard?.full_name ?? 'Unknown guard'} <span className="text-brand-muted-light font-normal">× {i.quantity}{i.serialNumber ? ` · ${i.serialNumber}` : ''}</span></p>
                        <p className="text-xs text-brand-muted-light">
                          Issued {formatDate(i.issuedAt)}
                          {i.returnedAt ? ` · Returned ${formatDate(i.returnedAt)} (${i.returnCondition})` : ' · Still checked out'}
                        </p>
                      </div>
                      {!i.returnedAt && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button type="button" onClick={() => returnIssue(i, 'GOOD')} className="text-xs text-green-600 hover:underline">Return</button>
                          <button type="button" onClick={() => returnIssue(i, 'DAMAGED')} className="text-xs text-amber-600 hover:underline">Damaged</button>
                          <button type="button" onClick={() => returnIssue(i, 'LOST')} className="text-xs text-red-600 hover:underline">Lost</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIssueTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
