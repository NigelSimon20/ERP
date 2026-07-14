'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, EditRegular, ToggleLeftRegular } from '@fluentui/react-icons';

interface PayslipItem { id: string; name: string; type: 'EARNING' | 'DEDUCTION'; calculationMethod: string; amount: number | null; percentage: number | null; taxable: boolean; active: boolean }
type FormValues = { name: string; type: 'EARNING' | 'DEDUCTION'; calculationMethod: string; amount: string; percentage: string; taxable: string }

export default function PayslipItemsPage() {
  const [earnings, setEarnings] = useState<PayslipItem[]>([])
  const [deductions, setDeductions] = useState<PayslipItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<PayslipItem | null>(null)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', type: 'EARNING', calculationMethod: 'FIXED', amount: '', percentage: '', taxable: 'true' },
  })
  const calcMethod = watch('calculationMethod')

  async function fetchItems() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/payslip-items')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load payslip items')
        setEarnings([])
        setDeductions([])
        return
      }
      setEarnings(json.earnings ?? [])
      setDeductions(json.deductions ?? [])
    } catch {
      toast.error('Network error loading payslip items')
      setEarnings([])
      setDeductions([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [])

  function openCreate(defaultType: 'EARNING' | 'DEDUCTION' = 'EARNING') { setEditing(null); reset({ name: '', type: defaultType, calculationMethod: 'FIXED', amount: '', percentage: '', taxable: 'true' }); setShowDialog(true) }
  function openEdit(item: PayslipItem) {
    setEditing(item)
    reset({ name: item.name, type: item.type, calculationMethod: item.calculationMethod, amount: item.amount != null ? String(item.amount) : '', percentage: item.percentage != null ? String(item.percentage) : '', taxable: String(item.taxable) })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/payslip-items/${editing.id}` : '/api/finance/payslip-items'
    const method = editing ? 'PUT' : 'POST'
    const body: Record<string, unknown> = { name: data.name, type: data.type, calculationMethod: data.calculationMethod, taxable: data.taxable === 'true' }
    if (data.calculationMethod === 'FIXED') body.amount = Number(data.amount) || 0
    else body.percentage = Number(data.percentage) || 0
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Item updated' : 'Item created')
    setShowDialog(false); fetchItems()
  }

  async function toggleActive(item: PayslipItem) {
    const res = await fetch(`/api/finance/payslip-items/${item.id}?action=toggle`, { method: 'PUT' })
    if (!res.ok) { toast.error('Failed to toggle'); return }
    toast.success(item.active ? 'Item deactivated' : 'Item activated')
    fetchItems()
  }

  async function deleteItem(item: PayslipItem) {
    if (!confirm(`Delete ${item.name}?`)) return
    const res = await fetch(`/api/finance/payslip-items/${item.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    toast.success('Item deleted'); fetchItems()
  }

  function ItemRow({ item }: { item: PayslipItem }) {
    return (
      <tr className={`hover:bg-muted/50 ${!item.active ? 'opacity-50' : ''}`}>
        <td className="px-4 py-2.5 font-medium text-foreground">{item.name}</td>
        <td className="px-4 py-2.5 text-muted-foreground text-xs">{item.calculationMethod.replace('_', ' ')}</td>
        <td className="px-4 py-2.5 text-right font-medium">
          {item.calculationMethod === 'FIXED' ? formatCurrency(item.amount ?? 0) : `${item.percentage ?? 0}%`}
        </td>
        <td className="px-4 py-2.5 text-center">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${item.taxable ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>{item.taxable ? 'Taxable' : 'Non-tax'}</span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit item"><EditRegular className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => toggleActive(item)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-primary" aria-label={item.active ? 'Deactivate' : 'Activate'}><ToggleLeftRegular className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => deleteItem(item)} className="p-1.5 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Delete item"><DeleteRegular className="h-3.5 w-3.5" /></button>
          </div>
        </td>
      </tr>
    )
  }

  function Section({ title, items, type }: { title: string; items: PayslipItem[]; type: 'EARNING' | 'DEDUCTION' }) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Button type="button" onClick={() => openCreate(type)} variant="outline" className="h-7 text-xs px-2.5">
            <AddRegular className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
        {loading ? (
          <div className="p-4 space-y-2 animate-pulse"><div className="h-3 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-1/2" /></div>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-muted-light text-center">No {title.toLowerCase()} configured yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Name</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Method</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Value</th>
                <th className="text-center px-4 py-2 font-medium text-muted-foreground text-xs">Tax</th>
                <th className="px-4 py-2 font-medium text-muted-foreground text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => <ItemRow key={item.id} item={item} />)}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Payslip Items" description="Configure earnings and deduction components for payroll" action={<Button type="button" onClick={() => openCreate()} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Item</Button>} />

      <div className="mt-5 space-y-5">
        <Section title="Earnings" items={earnings} type="EARNING" />
        <Section title="Deductions" items={deductions} type="DEDUCTION" />
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Payslip Item' : 'New Payslip Item'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="e.g. Basic Salary" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="EARNING">Earning</SelectItem><SelectItem value="DEDUCTION">Deduction</SelectItem></SelectContent>
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
                      <SelectItem value="PERCENT_BASIC">% of Basic</SelectItem>
                      <SelectItem value="PERCENT_GROSS">% of Gross</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            {calcMethod === 'FIXED' ? (
              <div className="space-y-1.5"><Label>Amount *</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('amount')} /></div>
            ) : (
              <div className="space-y-1.5"><Label>Percentage *</Label><Input type="number" step="0.01" min="0" max="100" placeholder="e.g. 7.5" {...register('percentage')} /></div>
            )}
            <div className="space-y-1.5">
              <Label>Taxable</Label>
              <Controller control={control} name="taxable" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Yes — taxable</SelectItem><SelectItem value="false">No — non-taxable</SelectItem></SelectContent>
                </Select>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Item'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
