'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { DismissRegular, PeopleRegular } from '@fluentui/react-icons';

interface Customer { id: string; name: string; email: string | null; phone: string | null; contactPerson: string | null; address: string | null; paymentTerms: number; creditLimit: number; outstandingBalance: number }
interface Invoice { id: string; invoiceNumber: string; issueDate: string; dueDate: string; totalAmount: number; paidAmount: number; balanceDue: number; status: string }
interface Receipt { id: string; reference: string; date: string; amount: number; paymentMethod: string | null }
interface Site { id: string; name: string; status: string; contractEnd: string | null; contractValue: number | null }
interface CustomerDetail extends Customer { invoices: Invoice[]; receipts: Receipt[]; sites: Site[]; outstandingBalance: number }
type EditForm = { name: string; email: string; phone: string; contactPerson: string; address: string; paymentTerms: string; creditLimit: string }

const INV_STATUS: Record<string, string> = { UNPAID: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', PARTIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', OVERDUE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300', VOID: 'bg-muted text-muted-foreground' }
const SITE_STATUS: Record<string, string> = { ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', INACTIVE: 'bg-muted text-muted-foreground', SUSPENDED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editing, setEditing] = useState(false)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<EditForm>()

  async function fetchCustomers() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    try {
      const res = await fetch(`/api/bd/customers?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load customers'); setCustomers([]); return }
      setCustomers(json.customers ?? [])
    } catch {
      toast.error('Network error loading customers')
      setCustomers([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchCustomers() }, [search])

  async function openDetail(customer: Customer) {
    setLoadingDetail(true)
    setEditing(false)
    try {
      const res = await fetch(`/api/bd/customers/${customer.id}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load customer'); setSelectedCustomer(null); return }
      const detail = json.customer ?? json
      setSelectedCustomer(detail)
      reset({ name: detail.name, email: detail.email ?? '', phone: detail.phone ?? '', contactPerson: detail.contactPerson ?? '', address: detail.address ?? '', paymentTerms: String(detail.paymentTerms), creditLimit: String(Number(detail.creditLimit)) })
    } catch {
      toast.error('Network error loading customer')
      setSelectedCustomer(null)
    } finally { setLoadingDetail(false) }
  }

  async function onSave(data: EditForm) {
    if (!selectedCustomer) return
    const res = await fetch('/api/bd/customers', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedCustomer.id, ...data, paymentTerms: Number(data.paymentTerms), creditLimit: Number(data.creditLimit) }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Customer updated')
    setEditing(false)
    setSelectedCustomer(prev => prev ? { ...prev, ...(json.customer ?? json) } : prev)
    fetchCustomers()
  }

  const cust = selectedCustomer

  return (
    <div className="flex gap-4">
      {/* Customer List */}
      <div className="flex-1 min-w-0">
        <PageHeader title="Customers" description="Manage your customer accounts" />

        <div className="mt-4">
          <Input placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        </div>

        <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : customers.length === 0 ? (
            <div className="py-16"><EmptyState icon={PeopleRegular} title="No customers found" description="Customers are created when leads are marked as Won, or manually" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Terms</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Credit Limit</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c) => (
                  <tr key={c.id} className={`hover:bg-muted/50 cursor-pointer ${selectedCustomer && (selectedCustomer as unknown as { customer: { id: string } }).customer?.id === c.id ? 'bg-primary/5' : ''}`} onClick={() => openDetail(c)}>
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">Net {c.paymentTerms}d</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{Number(c.creditLimit) > 0 ? formatCurrency(Number(c.creditLimit)) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium ${Number(c.outstandingBalance) > 0 ? 'text-primary' : 'text-green-600 dark:text-green-400'}`}>
                      {Number(c.outstandingBalance) > 0 ? formatCurrency(c.outstandingBalance) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      {(selectedCustomer || loadingDetail) && (
        <div className="w-96 shrink-0 rounded-lg border border-border bg-card h-fit sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
          {loadingDetail ? (
            <div className="py-16 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : cust && (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
                <h3 className="font-semibold text-foreground truncate text-sm">{cust.name}</h3>
                <button type="button" onClick={() => setSelectedCustomer(null)} className="p-1 rounded hover:bg-muted text-brand-muted-light" aria-label="Close"><DismissRegular className="h-4 w-4" /></button>
              </div>

              <Tabs defaultValue="overview" className="p-0">
                <TabsList className="w-full rounded-none border-b border-border h-9 bg-muted/50 justify-start px-2 gap-0">
                  {['overview', 'invoices', 'receipts', 'balance', 'sites'].map(t => (
                    <TabsTrigger key={t} value={t} className="text-xs capitalize rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent px-3">{t}</TabsTrigger>
                  ))}
                </TabsList>

                {/* Overview */}
                <TabsContent value="overview" className="p-4 space-y-4 mt-0">
                  {editing ? (
                    <form onSubmit={handleSubmit(onSave)} className="space-y-3">
                      <div className="space-y-1"><Label className="text-xs">Name</Label><Input {...register('name')} /></div>
                      <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" {...register('email')} /></div>
                      <div className="space-y-1"><Label className="text-xs">Phone</Label><Input {...register('phone')} /></div>
                      <div className="space-y-1"><Label className="text-xs">Contact Person</Label><Input {...register('contactPerson')} /></div>
                      <div className="space-y-1"><Label className="text-xs">Address</Label><Input {...register('address')} /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Payment Terms (days)</Label><Input type="number" {...register('paymentTerms')} /></div>
                        <div className="space-y-1"><Label className="text-xs">Credit Limit</Label><Input type="number" step="0.01" {...register('creditLimit')} /></div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                        <Button type="submit" size="sm" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Save'}</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="space-y-2 text-xs">
                        {[['Email', cust.email], ['Phone', cust.phone], ['Contact', cust.contactPerson], ['Address', cust.address], ['Payment Terms', `Net ${cust.paymentTerms} days`], ['Credit Limit', Number(cust.creditLimit) > 0 ? formatCurrency(Number(cust.creditLimit)) : 'None']].map(([k, v]) => v ? (
                          <div key={String(k)} className="flex gap-2"><span className="text-brand-muted-light w-24 shrink-0">{k}</span><span className="text-foreground">{String(v)}</span></div>
                        ) : null)}
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Edit Customer</Button>
                    </>
                  )}
                </TabsContent>

                {/* Invoices */}
                <TabsContent value="invoices" className="p-4 mt-0">
                  {selectedCustomer && (selectedCustomer as unknown as { invoices: Invoice[] }).invoices?.length === 0 ? (
                    <p className="text-xs text-brand-muted-light text-center py-6">No invoices</p>
                  ) : (
                    <div className="space-y-2">
                      {((selectedCustomer as unknown as { invoices: Invoice[] }).invoices ?? []).map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2">
                          <div><p className="font-mono text-muted-foreground">{inv.invoiceNumber}</p><p className="text-brand-muted-light">{formatDate(new Date(inv.issueDate))}</p></div>
                          <div className="text-right"><p className="font-medium">{formatCurrency(Number(inv.totalAmount))}</p><span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${INV_STATUS[inv.status] ?? ''}`}>{inv.status}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Receipts */}
                <TabsContent value="receipts" className="p-4 mt-0">
                  {(selectedCustomer as unknown as { receipts: Receipt[] }).receipts?.length === 0 ? (
                    <p className="text-xs text-brand-muted-light text-center py-6">No payments recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {((selectedCustomer as unknown as { receipts: Receipt[] }).receipts ?? []).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2">
                          <div><p className="font-mono text-muted-foreground">{r.reference}</p><p className="text-brand-muted-light">{formatDate(new Date(r.date))}</p></div>
                          <div className="text-right"><p className="font-medium text-green-700 dark:text-green-400">{formatCurrency(Number(r.amount))}</p><p className="text-brand-muted-light">{r.paymentMethod ?? '—'}</p></div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Balance */}
                <TabsContent value="balance" className="p-4 mt-0">
                  <div className="space-y-3">
                    <div className={`rounded-lg p-4 text-center ${Number((selectedCustomer as unknown as { outstandingBalance: number }).outstandingBalance) > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                      <p className="text-xs text-muted-foreground mb-1">Outstanding Balance</p>
                      <p className={`text-2xl font-bold ${Number((selectedCustomer as unknown as { outstandingBalance: number }).outstandingBalance) > 0 ? 'text-primary' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(Number((selectedCustomer as unknown as { outstandingBalance: number }).outstandingBalance))}
                      </p>
                    </div>
                    <div className="text-xs text-brand-muted-light text-center">Sum of outstanding invoice balances</div>
                  </div>
                </TabsContent>

                {/* Sites */}
                <TabsContent value="sites" className="p-4 mt-0">
                  {(selectedCustomer as unknown as { sites: Site[] }).sites?.length === 0 ? (
                    <p className="text-xs text-brand-muted-light text-center py-6">No sites linked</p>
                  ) : (
                    <div className="space-y-2">
                      {((selectedCustomer as unknown as { sites: Site[] }).sites ?? []).map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2">
                          <div><p className="font-medium text-foreground">{s.name}</p>{s.contractEnd && <p className="text-brand-muted-light">Until {formatDate(new Date(s.contractEnd))}</p>}</div>
                          <div className="text-right"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${SITE_STATUS[s.status] ?? ''}`}>{s.status}</span>{s.contractValue != null && <p className="text-muted-foreground mt-0.5">{formatCurrency(Number(s.contractValue))}</p>}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      )}
    </div>
  )
}
