'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Controller } from 'react-hook-form'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { ImportWizardDialog } from '@/components/shared/import-export/ImportWizardDialog'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ArrowDownloadRegular, ArrowUploadRegular, CheckmarkCircleRegular, CopyRegular, DeleteRegular, DocumentArrowDownRegular, EditRegular, KeyRegular, PeopleRegular, SearchRegular } from '@fluentui/react-icons';

interface Customer { id: string; name: string; email: string | null; phone: string | null; address: string | null; paymentTerms: number; creditLimit: number; outstandingBal: number; invoiceCount: number }
type FormValues = { name: string; email: string; phone: string; address: string; paymentTerms: string; creditLimit: string }

const PAYMENT_TERMS = [7, 14, 30, 60, 90]

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [creatingPortalFor, setCreatingPortalFor] = useState<string | null>(null)
  const [portalCredentials, setPortalCredentials] = useState<{ name: string; email: string; tempPassword: string } | null>(null)

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

  async function createPortalAccount(c: Customer) {
    if (!c.email) { toast.error('Add an email address for this customer first'); return }
    setCreatingPortalFor(c.id)
    try {
      const res = await fetch(`/api/finance/customers/${c.id}/create-account`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to create portal account'); return }
      toast.success('Client portal account created')
      setPortalCredentials({ name: json.user.name, email: json.user.email, tempPassword: json.tempPassword })
    } catch {
      toast.error('Network error creating portal account')
    } finally {
      setCreatingPortalFor(null)
    }
  }

  function copyPortalPassword() {
    if (!portalCredentials) return
    navigator.clipboard.writeText(portalCredentials.tempPassword)
    toast.success('Password copied to clipboard')
  }

  async function exportCsv() {
    const res = await fetch('/api/finance/customers/export?format=csv')
    if (!res.ok) { toast.error('Export failed'); return }
    const blob = await res.blob()
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  return (
    <div>
      <PageHeader title="Customers" description="Manage your customer accounts" action={
        <div className="flex items-center gap-2">
          <a href="/api/finance/customers/import/template" className="inline-flex">
            <Button type="button" variant="outline"><DocumentArrowDownRegular className="h-4 w-4 mr-1" /> Template</Button>
          </a>
          <Button type="button" variant="outline" onClick={() => setShowImportWizard(true)}><ArrowUploadRegular className="h-4 w-4 mr-1" /> Import</Button>
          <Button type="button" variant="outline" onClick={exportCsv}><ArrowDownloadRegular className="h-4 w-4 mr-1" /> Export CSV</Button>
          <Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Customer</Button>
        </div>
      } />

      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <SearchRegular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted-light" />
          <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-40 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /><div className="h-3 w-20 bg-muted rounded" /></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No customers yet" description="Add your first customer to start raising invoices" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Customer</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Credit Limit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Outstanding</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Invoices</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(Number(c.creditLimit))}</td>
                    <td className={`px-4 py-3 text-right font-medium ${Number(c.outstandingBal) > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Number(c.outstandingBal))}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{c.invoiceCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => createPortalAccount(c)}
                          disabled={creatingPortalFor === c.id}
                          className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground disabled:opacity-40"
                          aria-label="Create client portal login"
                          title="Create client portal login"
                        >
                          <KeyRegular className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit customer"><EditRegular className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteCustomer(c)} className="p-1.5 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" aria-label="Delete customer"><DeleteRegular className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportWizardDialog
        open={showImportWizard}
        onOpenChange={setShowImportWizard}
        apiBase="/api/finance/customers/import"
        moduleLabel="Customers"
        onComplete={fetchCustomers}
      />

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
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Customer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Portal account temp password — shown once, right after creation */}
      <Dialog open={!!portalCredentials} onOpenChange={(open) => !open && setPortalCredentials(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckmarkCircleRegular className="h-5 w-5 text-green-600" />
              Client Portal Account Created
            </DialogTitle>
            <DialogDescription>
              Share this temporary password with {portalCredentials?.name} securely. It will not be shown again — the account requires a password change on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</p>
              <p className="text-sm text-foreground font-medium">{portalCredentials?.email}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Temporary Password</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 text-sm font-mono bg-card border border-border rounded-md px-3 py-2 text-foreground">
                  {portalCredentials?.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={copyPortalPassword}
                  className="p-2 rounded-md border border-border hover:bg-muted text-brand-muted-light hover:text-foreground transition-colors"
                  aria-label="Copy password"
                  title="Copy"
                >
                  <CopyRegular className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPortalCredentials(null)} className="bg-primary hover:bg-brand-red-dark text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
