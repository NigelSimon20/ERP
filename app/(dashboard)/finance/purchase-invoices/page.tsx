'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, DocumentRegular, PaymentRegular, ProhibitedRegular } from '@fluentui/react-icons';

interface Invoice { id: string; billNumber: string; issueDate: string; dueDate: string; totalAmount: number; paidAmount: number; balanceDue: number; status: string; supplier: { id: string; name: string } }
interface Supplier { id: string; name: string }
interface BankAccount { id: string; bankName: string; accountNumber: string }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type InvoiceForm = { supplierId: string; issueDate: string; dueDate: string; description: string; lineItems: LineItem[] }
type PaymentForm = { bankAccountId: string; amount: string; paymentDate: string; notes: string }

const STATUS_STYLES: Record<string, string> = { DRAFT: 'bg-muted text-foreground', UNPAID: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', PARTIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', OVERDUE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300', VOID: 'bg-muted text-brand-muted-light' }
const STATUS_TABS = ['ALL', 'UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']
const BLANK_LINE: LineItem = { description: '', quantity: '1', unitPrice: '', taxRate: '0' }

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status}</span>
}

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState('ALL')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null)

  const { register: invReg, handleSubmit: invSubmit, control: invCtrl, reset: invReset, formState: { isSubmitting: invSubmitting } } = useForm<InvoiceForm>({
    defaultValues: { supplierId: '', issueDate: '', dueDate: '', description: '', lineItems: [BLANK_LINE] },
  })
  const { fields, append, remove } = useFieldArray({ control: invCtrl, name: 'lineItems' })
  const watchedItems = useWatch({ control: invCtrl, name: 'lineItems' }) ?? []
  const totals = useMemo(() => {
    let sub = 0, tax = 0
    for (const item of watchedItems) {
      const qty = Number(item?.quantity) || 0; const price = Number(item?.unitPrice) || 0; const rate = Number(item?.taxRate) || 0
      const lineTotal = qty * price; sub += lineTotal; tax += lineTotal * (rate / 100)
    }
    return { subTotal: sub, taxTotal: tax, totalAmount: sub + tax }
  }, [watchedItems])

  const { register: pmtReg, handleSubmit: pmtSubmit, reset: pmtReset, formState: { isSubmitting: pmtSubmitting } } = useForm<PaymentForm>({
    defaultValues: { bankAccountId: '', amount: '', paymentDate: '', notes: '' },
  })

  async function fetchInvoices() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusTab !== 'ALL') params.set('status', statusTab)
      const res = await fetch(`/api/finance/purchase-invoices?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load purchase invoices'); setInvoices([]); return }
      setInvoices(json.invoices ?? [])
    } catch {
      toast.error('Network error loading purchase invoices')
      setInvoices([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchInvoices() }, [statusTab])
  useEffect(() => {
    Promise.all([fetch('/api/finance/suppliers').then(r => r.json()), fetch('/api/finance/bank-accounts').then(r => r.json())]).then(([s, b]) => {
      setSuppliers(s.suppliers ?? [])
      setBankAccounts(b.accounts ?? [])
    }).catch((err) => console.error(err))
  }, [])

  async function onCreateInvoice(data: InvoiceForm) {
    const res = await fetch('/api/finance/purchase-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, lineItems: data.lineItems.filter((l) => l.description).map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, taxRate: Number(l.taxRate) || 0 })) }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Bill ${json.invoice.billNumber} created`)
    setShowCreateDialog(false); invReset(); fetchInvoices()
  }

  function openRecordPayment(inv: Invoice) {
    setPaymentTarget(inv)
    pmtReset({ bankAccountId: '', amount: String(Number(inv.balanceDue).toFixed(2)), paymentDate: new Date().toISOString().split('T')[0], notes: '' })
  }

  async function onRecordPayment(data: PaymentForm) {
    if (!paymentTarget) return
    const res = await fetch('/api/finance/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankAccountId: data.bankAccountId, amount: Number(data.amount), paymentDate: data.paymentDate, payee: paymentTarget.supplier.name, entityType: 'PURCHASE_INVOICE', entityId: paymentTarget.id, notes: data.notes }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Payment ${json.payment.reference} recorded`)
    setPaymentTarget(null); fetchInvoices()
  }

  async function voidInvoice(inv: Invoice) {
    if (!confirm(`Void bill ${inv.billNumber}?`)) return
    const res = await fetch(`/api/finance/purchase-invoices/${inv.id}?action=void`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Bill voided'); fetchInvoices()
  }

  return (
    <div>
      <PageHeader title="Purchase Invoices" description="Record and manage supplier bills" action={<Button type="button" onClick={() => { invReset(); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Bill</Button>} />

      <div className="mt-5 flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button type="button" key={tab} onClick={() => setStatusTab(tab)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${statusTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab}</button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : invoices.length === 0 ? (
          <div className="py-16"><EmptyState icon={DocumentRegular} title="No purchase invoices yet" description="Record bills from suppliers here" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> New Bill</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bill #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Issue Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Due Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Paid</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Balance</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className={`hover:bg-muted/50 ${inv.status === 'OVERDUE' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{inv.billNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{inv.supplier?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(inv.issueDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(inv.dueDate))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(inv.totalAmount))}</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatCurrency(Number(inv.paidAmount))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(inv.balanceDue))}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {inv.status !== 'VOID' && inv.status !== 'PAID' && (
                          <button type="button" onClick={() => openRecordPayment(inv)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600" aria-label="Record payment"><PaymentRegular className="h-3.5 w-3.5" /></button>
                        )}
                        {inv.status !== 'VOID' && (
                          <button type="button" onClick={() => voidInvoice(inv)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" aria-label="Void bill"><ProhibitedRegular className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Bill Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Invoice (Bill)</DialogTitle></DialogHeader>
          <form onSubmit={invSubmit(onCreateInvoice)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <Controller control={invCtrl} name="supplierId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Description</Label><Input placeholder="Bill description" {...invReg('description')} /></div>
              <div className="space-y-1.5"><Label>Issue Date *</Label><Input type="date" {...invReg('issueDate', { required: true })} /></div>
              <div className="space-y-1.5"><Label>Due Date *</Label><Input type="date" {...invReg('dueDate', { required: true })} /></div>
            </div>

            <div>
              <div className="grid grid-cols-12 gap-2 mb-1 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-4">Description</div><div className="col-span-2 text-right">Qty</div><div className="col-span-2 text-right">Unit Price</div><div className="col-span-2 text-right">Tax %</div><div className="col-span-1 text-right">Total</div><div className="col-span-1" />
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const qty = Number(watchedItems?.[index]?.quantity) || 0; const price = Number(watchedItems?.[index]?.unitPrice) || 0; const tax = Number(watchedItems?.[index]?.taxRate) || 0
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4"><Input className="h-8 text-xs" placeholder="Description" {...invReg(`lineItems.${index}.description`)} /></div>
                      <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="1" min="0" {...invReg(`lineItems.${index}.quantity`)} /></div>
                      <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" {...invReg(`lineItems.${index}.unitPrice`)} /></div>
                      <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" max="100" {...invReg(`lineItems.${index}.taxRate`)} /></div>
                      <div className="col-span-1 text-right text-xs font-medium text-foreground">{formatCurrency(qty * price * (1 + tax / 100))}</div>
                      <div className="col-span-1 flex justify-center"><button type="button" onClick={() => remove(index)} disabled={fields.length <= 1} className="p-1 text-brand-muted-light hover:text-red-400 disabled:opacity-30" aria-label="Remove line"><DeleteRegular className="h-3.5 w-3.5" /></button></div>
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={() => append(BLANK_LINE)} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline font-medium"><AddRegular className="h-3 w-3" /> Add Line</button>
            </div>

            <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1 text-right">
              <div className="text-muted-foreground">Sub-total: <strong>{formatCurrency(totals.subTotal)}</strong></div>
              <div className="text-muted-foreground">Tax: <strong>{formatCurrency(totals.taxTotal)}</strong></div>
              <div className="text-foreground font-bold text-base">Total: {formatCurrency(totals.totalAmount)}</div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={invSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{invSubmitting ? 'Creating…' : 'Create Bill'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={!!paymentTarget} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment — {paymentTarget?.billNumber}</DialogTitle></DialogHeader>
          <form onSubmit={pmtSubmit(onRecordPayment)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bank Account *</Label>
              <select className="w-full h-9 rounded-md border border-border px-3 text-sm" {...pmtReg('bankAccountId', { required: true })} aria-label="Bank account">
                <option value="">Select bank account</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Amount *</Label><Input type="number" step="0.01" {...pmtReg('amount', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Payment Date *</Label><Input type="date" {...pmtReg('paymentDate', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Optional notes" {...pmtReg('notes')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={pmtSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{pmtSubmitting ? 'Saving…' : 'Record Payment'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
