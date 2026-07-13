'use client'

import { useState, useEffect } from 'react'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { FaPlus } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import toast from 'react-hot-toast'

interface PayslipItem { id: string; name: string; type: string; calculationMethod: string; fixedAmount: number | null; percentage: number | null; taxable: boolean; active: boolean }
type FormValues = { name: string; type: string; calculationMethod: string; fixedAmount: string; percentage: string; taxable: boolean }

const METHOD_LABELS: Record<string, string> = { FIXED: 'Fixed Amount', PERCENTAGE_OF_BASIC: '% of Basic', PERCENTAGE_OF_GROSS: '% of Gross' }

function ItemCard({ item, onToggle, onEdit }: { item: PayslipItem; onToggle: (id: string) => void; onEdit: (item: PayslipItem) => void }) {
  const valueLabel = item.calculationMethod === 'FIXED'
    ? `$${Number(item.fixedAmount).toFixed(2)}`
    : `${Number(item.percentage).toFixed(2)}% (${METHOD_LABELS[item.calculationMethod]})`

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${item.active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'}`}>
      <div className="min-w-0">
        <p className={`font-medium text-sm ${item.active ? 'text-[#0D1B2A]' : 'text-gray-400'}`}>{item.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{valueLabel}{item.taxable ? ' · Taxable' : ''}</p>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        <button type="button" onClick={() => onEdit(item)} className="text-xs text-gray-400 hover:text-gray-700 hover:underline" aria-label="Edit item">Edit</button>
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${item.active ? 'bg-green-500' : 'bg-gray-300'}`}
          aria-label={item.active ? 'Deactivate item' : 'Activate item'}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.active ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
        </button>
      </div>
    </div>
  )
}

export default function PayslipItemsPage() {
  const [earnings, setEarnings] = useState<PayslipItem[]>([])
  const [deductions, setDeductions] = useState<PayslipItem[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<PayslipItem | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', type: 'EARNING', calculationMethod: 'FIXED', fixedAmount: '', percentage: '', taxable: true },
  })
  const calcMethod = useWatch({ control, name: 'calculationMethod' })

  async function fetchItems() {
    try {
      const res = await fetch('/api/hr/payslip-items')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load payslip items'); return }
      setEarnings(json.earnings ?? [])
      setDeductions(json.deductions ?? [])
    } catch {
      toast.error('Network error loading payslip items')
    }
  }

  useEffect(() => { fetchItems() }, [])

  function openCreate(type: 'EARNING' | 'DEDUCTION') {
    setEditing(null)
    reset({ name: '', type, calculationMethod: 'FIXED', fixedAmount: '', percentage: '', taxable: type === 'EARNING' })
    setShowDialog(true)
  }

  function openEdit(item: PayslipItem) {
    setEditing(item)
    reset({
      name: item.name, type: item.type, calculationMethod: item.calculationMethod,
      fixedAmount: item.fixedAmount != null ? String(Number(item.fixedAmount)) : '',
      percentage: item.percentage != null ? String(Number(item.percentage)) : '',
      taxable: item.taxable,
    })
    setShowDialog(true)
  }

  async function onToggle(id: string) {
    const res = await fetch(`/api/hr/payslip-items/${id}?action=toggle`, { method: 'PUT' })
    if (!res.ok) { toast.error('Failed to toggle'); return }
    fetchItems()
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/hr/payslip-items/${editing.id}` : '/api/hr/payslip-items'
    const method = editing ? 'PUT' : 'POST'
    const payload = {
      name: data.name, type: data.type, calculationMethod: data.calculationMethod,
      fixedAmount: data.calculationMethod === 'FIXED' ? Number(data.fixedAmount) : null,
      percentage: data.calculationMethod !== 'FIXED' ? Number(data.percentage) : null,
      taxable: data.taxable,
    }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Item updated' : 'Item created')
    setShowDialog(false); fetchItems()
  }

  function Section({ title, items, type }: { title: string; items: PayslipItem[]; type: 'EARNING' | 'DEDUCTION' }) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-lg">
          <h2 className="font-semibold text-[#0D1B2A]">{title}</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => openCreate(type)}><FaPlus className="h-3.5 w-3.5 mr-1" /> Add</Button>
        </div>
        <div className="p-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No {title.toLowerCase()} configured yet</p>
          ) : (
            items.map((item) => <ItemCard key={item.id} item={item} onToggle={onToggle} onEdit={openEdit} />)
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Payslip Items" description="Configure earnings and deductions applied during payroll processing" />
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Earnings" items={earnings} type="EARNING" />
        <Section title="Deductions" items={deductions} type="DEDUCTION" />
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Payslip Item' : 'New Payslip Item'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. PAYE Tax, Transport Allowance" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EARNING">Earning</SelectItem>
                      <SelectItem value="DEDUCTION">Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Controller control={control} name="calculationMethod" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Fixed Amount</SelectItem>
                      <SelectItem value="PERCENTAGE_OF_BASIC">% of Basic</SelectItem>
                      <SelectItem value="PERCENTAGE_OF_GROSS">% of Gross</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            {calcMethod === 'FIXED' ? (
              <div className="space-y-1.5"><Label>Amount ($)</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('fixedAmount')} /></div>
            ) : (
              <div className="space-y-1.5"><Label>Percentage (%)</Label><Input type="number" step="0.01" min="0" max="100" placeholder="0.00" {...register('percentage')} /></div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="taxable" {...register('taxable')} className="rounded" />
              <Label htmlFor="taxable" className="cursor-pointer font-normal">Taxable</Label>
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
