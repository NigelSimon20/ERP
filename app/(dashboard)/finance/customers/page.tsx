'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { FaPlus, FaUsers, FaSearch, FaPen, FaTrash } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Controller } from 'react-hook-form'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Customer { id: string; name: string; email: string | null; phone: string | null; address: string | null; paymentTerms: number; creditLimit: number; outstandingBal: number; invoiceCount: number }
type FormValues = { name: string; email: string; phone: string; address: string; paymentTerms: string; creditLimit: string }

const PAYMENT_TERMS = [7, 14, 30, 60, 90]

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', email: '', phone: '', address: '', paymentTerms: '30', creditLimit: '0' },
  })

  async function fetchCustomers() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/customers')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load customers'); setCustomers([]); return }
      setCustomers(json.customers ?? [])
    } catch {
      toast.error('Network error loading customers')
      setCustomers([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchCustomers() }, [])

  const filtered = useMemo(() =>
    customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.email ?? '').toLowerCase().includes(search.toLowerCase())),
    [customers, search]
  )

  function openCreate() { setEditing(null); reset({ name: '', email: '', phone: '', address: '', paymentTerms: '30', creditLimit: '0' }); setShowDialog(true) }
  function openEdit(c: Customer) { setEditing(c); reset({ name: c.name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', paymentTerms: String(c.paymentTerms), creditLimit: String(c.creditLimit) }); setShowDialog(true) }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/customers/${editing.id}` : '/api/finance/customers'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, paymentTerms: Number(data.paymentTerms), creditLimit: Number(data.creditLimit) }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Customer updated' : 'Customer created')
    setShowDialog(false)
    fetchCustomers()
  }

  async function deleteCustomer(c: Customer) {
    if (!confirm(`Delete ${c.name}?`)) return
    const res = await fetch(`/api/finance/customers/${c.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Customer deleted')
    fetchCustomers()
  }

  return (
    <div>
      <PageHeader title="Customers" description="Manage your customer accounts" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Add Customer</Button>} />

      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-40 bg-gray-200 rounded" /><div className="h-3 flex-1 bg-gray-100 rounded" /><div className="h-3 w-20 bg-gray-200 rounded" /></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaUsers} title="No customers yet" description="Add your first customer to start raising invoices" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Add Customer</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Phone</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Credit Limit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Outstanding</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Invoices</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-[#0D1B2A]">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(Number(c.creditLimit))}</td>
                    <td className={`px-4 py-3 text-right font-medium ${Number(c.outstandingBal) > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Number(c.outstandingBal))}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{c.invoiceCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" aria-label="Edit customer"><FaPen className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteCustomer(c)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Delete customer"><FaTrash className="h-3.5 w-3.5" /></button>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'New Customer'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input placeholder="Customer name" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="email@example.com" {...register('email')} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="+263…" {...register('phone')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Textarea placeholder="Street address…" rows={2} {...register('address')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Controller control={control} name="paymentTerms" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_TERMS.map((t) => <SelectItem key={t} value={String(t)}>{t} days</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Credit Limit</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('creditLimit')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Customer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
