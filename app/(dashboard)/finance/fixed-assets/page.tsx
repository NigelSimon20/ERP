'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { AddRegular, BoxRegular } from '@fluentui/react-icons';

interface Asset { id: string; name: string; category: string; purchaseDate: string; purchasePrice: number; usefulLifeYears: number; accumulatedDepreciation: number; currentValue: number; status: string }
type FormValues = { name: string; category: string; purchaseDate: string; purchasePrice: string; usefulLifeYears: string; depreciationMethod: string }

const CATEGORIES = ['Vehicles', 'Equipment', 'Furniture', 'Buildings', 'Technology', 'Other']

export default function FixedAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [depreciatingId, setDepreciatingId] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', category: 'Equipment', purchaseDate: '', purchasePrice: '', usefulLifeYears: '5', depreciationMethod: 'STRAIGHT_LINE' },
  })

  async function fetchAssets() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/fixed-assets')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load fixed assets'); setAssets([]); return }
      setAssets(json.assets ?? [])
    } catch {
      toast.error('Network error loading fixed assets')
      setAssets([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchAssets() }, [])

  const summary = useMemo(() => ({
    totalPurchasePrice: assets.reduce((s, a) => s + Number(a.purchasePrice), 0),
    totalAccumDep: assets.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0),
    netBookValue: assets.reduce((s, a) => s + Number(a.currentValue), 0),
  }), [assets])

  function openCreate() { setEditing(null); reset({ name: '', category: 'Equipment', purchaseDate: '', purchasePrice: '', usefulLifeYears: '5', depreciationMethod: 'STRAIGHT_LINE' }); setShowDialog(true) }
  function openEdit(a: Asset) {
    setEditing(a)
    reset({ name: a.name, category: a.category, purchaseDate: a.purchaseDate.split('T')[0], purchasePrice: String(Number(a.purchasePrice)), usefulLifeYears: String(a.usefulLifeYears), depreciationMethod: 'STRAIGHT_LINE' })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/fixed-assets/${editing.id}` : '/api/finance/fixed-assets'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, purchasePrice: Number(data.purchasePrice), usefulLifeYears: Number(data.usefulLifeYears) }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Asset updated' : 'Asset created')
    setShowDialog(false); fetchAssets()
  }

  async function depreciate(a: Asset) {
    const monthlyDep = Number(a.purchasePrice) / (a.usefulLifeYears * 12)
    if (!confirm(`Record 1 month depreciation of ${formatCurrency(monthlyDep)} for ${a.name}?`)) return
    setDepreciatingId(a.id)
    try {
      const res = await fetch(`/api/finance/fixed-assets/${a.id}?action=depreciate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Depreciation recorded')
      fetchAssets()
    } finally { setDepreciatingId(null) }
  }

  return (
    <div>
      <PageHeader title="Fixed Assets" description="Track and depreciate your company assets" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Asset</Button>} />

      {/* Summary Cards */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Asset Value</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(summary.totalPurchasePrice)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Accumulated Depreciation</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(summary.totalAccumDep)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Net Book Value</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(summary.netBookValue)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : assets.length === 0 ? (
          <div className="py-16"><EmptyState icon={BoxRegular} title="No fixed assets registered" description="Add your first asset to start tracking depreciation" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Asset</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Purchase Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Monthly Dep</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Accumulated</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Book Value</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assets.map((a) => {
                  const monthlyDep = Number(a.purchasePrice) / (a.usefulLifeYears * 12)
                  return (
                    <tr key={a.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{a.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(a.purchaseDate))}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(Number(a.purchasePrice))}</td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(monthlyDep)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(Number(a.accumulatedDepreciation))}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{formatCurrency(Number(a.currentValue))}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${a.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{a.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-xs">
                          <button type="button" onClick={() => openEdit(a)} className="text-muted-foreground hover:text-foreground hover:underline" aria-label="Edit asset">Edit</button>
                          {a.status === 'ACTIVE' && (
                            <button type="button" onClick={() => depreciate(a)} disabled={depreciatingId === a.id} className="text-amber-600 hover:underline disabled:opacity-50" aria-label="Record depreciation">{depreciatingId === a.id ? '…' : 'Depreciate'}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Asset' : 'New Fixed Asset'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Asset Name *</Label><Input placeholder="e.g. Toyota Land Cruiser" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Controller control={control} name="category" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Purchase Date *</Label><Input type="date" {...register('purchaseDate', { required: true })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Purchase Price *</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('purchasePrice', { required: true })} /></div>
              <div className="space-y-1.5"><Label>Useful Life (years)</Label><Input type="number" min="1" max="50" placeholder="5" {...register('usefulLifeYears')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Asset'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
