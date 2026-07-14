'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, BuildingRegular, DeleteRegular, EditRegular, SearchRegular } from '@fluentui/react-icons';

interface Supplier { id: string; name: string; email: string | null; phone: string | null; address: string | null; paymentTerms: number; outstandingBal: number; invoiceCount: number }
type FormValues = { name: string; email: string; phone: string; address: string; paymentTerms: string; creditLimit: string }

const PAYMENT_TERMS = [7, 14, 30, 60, 90]

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', email: '', phone: '', address: '', paymentTerms: '30', creditLimit: '0' },
  })

  async function fetchSuppliers() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/suppliers')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load suppliers'); setSuppliers([]); return }
      setSuppliers(json.suppliers ?? [])
    } catch {
      toast.error('Network error loading suppliers')
      setSuppliers([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchSuppliers() }, [])

  const filtered = useMemo(() =>
    suppliers.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.email ?? '').toLowerCase().includes(search.toLowerCase())),
    [suppliers, search]
  )

  function openCreate() { setEditing(null); reset({ name: '', email: '', phone: '', address: '', paymentTerms: '30', creditLimit: '0' }); setShowDialog(true) }
  function openEdit(s: Supplier) { setEditing(s); reset({ name: s.name, email: s.email ?? '', phone: s.phone ?? '', address: s.address ?? '', paymentTerms: String(s.paymentTerms), creditLimit: '0' }); setShowDialog(true) }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/suppliers/${editing.id}` : '/api/finance/suppliers'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, paymentTerms: Number(data.paymentTerms), creditLimit: Number(data.creditLimit) }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Supplier updated' : 'Supplier created')
    setShowDialog(false)
    fetchSuppliers()
  }

  async function deleteSupplier(s: Supplier) {
    if (!confirm(`Delete ${s.name}?`)) return
    const res = await fetch(`/api/finance/suppliers/${s.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Supplier deleted')
    fetchSuppliers()
  }

  return (
    <div>
      <PageHeader title="Suppliers" description="Manage your supplier accounts" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Supplier</Button>} />

      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <SearchRegular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted-light" />
          <Input placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-40 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16"><EmptyState icon={BuildingRegular} title="No suppliers yet" description="Add your first supplier to record purchase invoices" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Supplier</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Outstanding</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Bills</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{s.email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{s.phone ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${Number(s.outstandingBal) > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Number(s.outstandingBal))}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{s.invoiceCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit supplier"><EditRegular className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteSupplier(s)} className="p-1.5 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" aria-label="Delete supplier"><DeleteRegular className="h-3.5 w-3.5" /></button>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="Supplier name" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="email@example.com" {...register('email')} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="+263…" {...register('phone')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Textarea placeholder="Street address…" rows={2} {...register('address')} /></div>
            <div className="space-y-1.5">
              <Label>Payment Terms</Label>
              <Controller control={control} name="paymentTerms" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_TERMS.map((t) => <SelectItem key={t} value={String(t)}>{t} days</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Supplier'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
