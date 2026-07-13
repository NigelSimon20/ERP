'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaBox, FaExclamationTriangle } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface InventoryItem { id: string; name: string; category: string; unit: string; quantityOnHand: number; reorderLevel: number; unitCost: number; totalValue: number; lowStock: boolean }
type FormValues = { name: string; category: string; unit: string; quantityOnHand: string; reorderLevel: string; unitCost: string }

const UNITS = ['each', 'kg', 'litre', 'metre', 'box', 'set']
const CATEGORIES = ['Security Equipment', 'Uniforms', 'Stationery', 'Cleaning', 'First Aid', 'IT Equipment', 'Other']

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [summary, setSummary] = useState({ totalItems: 0, totalValue: 0, lowStockCount: 0 })
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', category: 'Other', unit: 'each', quantityOnHand: '0', reorderLevel: '5', unitCost: '0' },
  })

  async function fetchItems() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/inventory')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load inventory')
        setItems([])
        setSummary({ totalItems: 0, totalValue: 0, lowStockCount: 0 })
        return
      }
      setItems(json.items ?? [])
      setSummary({ totalItems: json.totalItems ?? 0, totalValue: json.totalValue ?? 0, lowStockCount: json.lowStockCount ?? 0 })
    } catch {
      toast.error('Network error loading inventory')
      setItems([])
      setSummary({ totalItems: 0, totalValue: 0, lowStockCount: 0 })
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [])

  function openCreate() { setEditing(null); reset({ name: '', category: 'Other', unit: 'each', quantityOnHand: '0', reorderLevel: '5', unitCost: '0' }); setShowDialog(true) }
  function openEdit(i: InventoryItem) { setEditing(i); reset({ name: i.name, category: i.category, unit: i.unit, quantityOnHand: String(i.quantityOnHand), reorderLevel: String(i.reorderLevel), unitCost: String(i.unitCost) }); setShowDialog(true) }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/inventory/${editing.id}` : '/api/finance/inventory'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, quantityOnHand: Number(data.quantityOnHand), reorderLevel: Number(data.reorderLevel), unitCost: Number(data.unitCost) }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Item updated' : 'Item created')
    setShowDialog(false); fetchItems()
  }

  async function deleteItem(i: InventoryItem) {
    if (!confirm(`Remove ${i.name} from inventory?`)) return
    const res = await fetch(`/api/finance/inventory/${i.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    toast.success('Item removed'); fetchItems()
  }

  return (
    <div>
      <PageHeader title="Inventory" description="Track stock levels and reorder points" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Add Item</Button>} />

      {/* Summary */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Total Items</p>
          <p className="text-2xl font-bold text-[#0D1B2A]">{summary.totalItems}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Total Stock Value</p>
          <p className="text-2xl font-bold text-[#0D1B2A]">{formatCurrency(summary.totalValue)}</p>
        </div>
        <div className={`rounded-lg border p-4 ${summary.lowStockCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-xs text-gray-500 mb-1">Low Stock Items</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${summary.lowStockCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>{summary.lowStockCount}</p>
            {summary.lowStockCount > 0 && <FaExclamationTriangle className="h-5 w-5 text-amber-500" />}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaBox} title="No inventory items" description="Add items to track your stock levels" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Add Item</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Item Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Category</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Unit</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Qty on Hand</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Reorder Level</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Unit Cost</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total Value</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((i) => (
                <tr key={i.id} className={`hover:bg-gray-50 ${i.lowStock ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-3 font-medium text-[#0D1B2A]">{i.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{i.category}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{i.unit}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className={i.lowStock ? 'text-amber-600 font-bold' : 'text-gray-700'}>{i.quantityOnHand}</span>
                      {i.lowStock && <span className="text-xs bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5">Low</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{i.reorderLevel}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(i.unitCost)}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#0D1B2A]">{formatCurrency(i.totalValue)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs">
                      <button type="button" onClick={() => openEdit(i)} className="text-gray-500 hover:text-[#0D1B2A] hover:underline" aria-label="Edit item">Edit</button>
                      <button type="button" onClick={() => deleteItem(i)} className="text-red-400 hover:underline" aria-label="Remove item">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Item' : 'New Inventory Item'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Item Name *</Label><Input placeholder="e.g. Patrol Torches" {...register('name', { required: true })} /></div>
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
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Controller control={control} name="unit" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Qty on Hand</Label><Input type="number" min="0" step="1" {...register('quantityOnHand')} /></div>
              <div className="space-y-1.5"><Label>Reorder Level</Label><Input type="number" min="0" step="1" {...register('reorderLevel')} /></div>
              <div className="space-y-1.5"><Label>Unit Cost</Label><Input type="number" min="0" step="0.01" {...register('unitCost')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Item'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
