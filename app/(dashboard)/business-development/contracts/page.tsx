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
import { AddRegular, DeleteRegular, DocumentRegular } from '@fluentui/react-icons';

interface Contract {
  id: string
  contractNumber: string
  title: string
  customerId: string | null
  siteId: string | null
  contractValue: number
  billingFrequency: string | null
  startDate: string
  endDate: string | null
  status: 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
  notes: string | null
}
interface Customer { id: string; name: string }
interface Site { id: string; name: string }

type FormValues = {
  title: string
  customerId: string
  siteId: string
  contractValue: string
  billingFrequency: string
  startDate: string
  endDate: string
  notes: string
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  EXPIRED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  TERMINATED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
}
const BILLING_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONCE_OFF']

const defaultValues: FormValues = { title: '', customerId: '', siteId: '', contractValue: '', billingFrequency: 'MONTHLY', startDate: new Date().toISOString().split('T')[0], endDate: '', notes: '' }

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({ defaultValues })

  async function fetchContracts() {
    setLoading(true)
    try {
      const res = await fetch('/api/bd/contracts')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load contracts'); setContracts([]); return }
      setContracts(json.contracts ?? [])
    } catch {
      toast.error('Network error loading contracts')
      setContracts([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchContracts() }, [])
  useEffect(() => {
    Promise.all([
      fetch('/api/bd/customers').then(r => r.json()),
      fetch('/api/bd/sites').then(r => r.json()),
    ]).then(([c, s]) => {
      setCustomers(c.customers ?? [])
      setSites(s.sites ?? [])
    }).catch((err) => console.error(err))
  }, [])

  function openCreate() {
    reset(defaultValues)
    setShowDialog(true)
  }

  async function onCreate(data: FormValues) {
    const payload = {
      title: data.title,
      customerId: data.customerId || null,
      siteId: data.siteId || null,
      contractValue: Number(data.contractValue),
      billingFrequency: data.billingFrequency || null,
      startDate: data.startDate,
      endDate: data.endDate || null,
      notes: data.notes || null,
    }
    const res = await fetch('/api/bd/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Contract ${json.contract.contractNumber} created`)
    setShowDialog(false)
    fetchContracts()
  }

  async function updateStatus(c: Contract, status: string) {
    const res = await fetch(`/api/bd/contracts/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!res.ok) { toast.error('Failed to update status'); return }
    toast.success('Status updated')
    fetchContracts()
  }

  async function deleteContract(c: Contract) {
    if (!confirm(`Delete ${c.contractNumber}?`)) return
    const res = await fetch(`/api/bd/contracts/${c.id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(json.error ?? 'Only DRAFT contracts can be deleted'); return }
    toast.success('Contract deleted')
    fetchContracts()
  }

  function customerName(id: string | null) {
    return customers.find(c => c.id === id)?.name ?? '—'
  }
  function siteName(id: string | null) {
    return sites.find(s => s.id === id)?.name ?? '—'
  }

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Track ongoing customer contracts and their recurring revenue"
        action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Contract</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : contracts.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={DocumentRegular} title="No contracts yet" description="Create your first customer contract" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> New Contract</Button>} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Contract #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Start Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.contractNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{c.title}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{customerName(c.customerId)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{siteName(c.siteId)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(c.startDate))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(c.contractValue))}{c.billingFrequency && c.billingFrequency !== 'ONCE_OFF' ? <span className="text-muted-foreground font-normal">/{c.billingFrequency.toLowerCase().replace('ly', '')}</span> : null}</td>
                    <td className="px-4 py-3">
                      <select value={c.status} onChange={e => updateStatus(c, e.target.value)} className={`text-xs rounded-full px-2 py-0.5 border-0 ${STATUS_STYLES[c.status] ?? 'bg-muted text-muted-foreground'}`} aria-label="Contract status">
                        <option value="DRAFT">Draft</option>
                        <option value="ACTIVE">Active</option>
                        <option value="EXPIRED">Expired</option>
                        <option value="TERMINATED">Terminated</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {c.status === 'DRAFT' && (
                        <button type="button" onClick={() => deleteContract(c)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Delete contract"><DeleteRegular className="h-3.5 w-3.5" /></button>
                      )}
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
          <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input placeholder="e.g. Guarding Services — Head Office" {...register('title', { required: 'Required' })} />
            </div>

            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Controller control={control} name="customerId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>

            <div className="space-y-1.5">
              <Label>Site</Label>
              <Controller control={control} name="siteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site (optional)" /></SelectTrigger>
                  <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contract Value *</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register('contractValue', { required: 'Required' })} />
              </div>
              <div className="space-y-1.5">
                <Label>Billing Frequency</Label>
                <Controller control={control} name="billingFrequency" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BILLING_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f.replace('_', ' ')}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" {...register('startDate', { required: 'Required' })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" {...register('endDate')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" {...register('notes')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {isSubmitting ? 'Saving…' : 'Create Contract'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
