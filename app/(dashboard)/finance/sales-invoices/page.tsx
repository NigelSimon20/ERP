'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateInvoiceTotals } from '@/lib/calculations'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, DocumentRegular, EyeRegular, ProhibitedRegular, ReceiptRegular } from '@fluentui/react-icons';

interface Invoice {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  currency?: string
  totalAmount: number
  paidAmount: number
  balanceDue: number
  status: string
  customer: { id: string; name: string }
}

interface Customer { id: string; name: string }
interface BankAccount { id: string; bankName: string; accountNumber: string }
interface GLAccount { id: string; account_name: string; account_code: string; account_type: string }
interface TaxSettings { taxName: string; taxRate: number; taxEnabled: boolean; taxInclusive: boolean; taxAppliedByDefault: boolean }

type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type InvoiceForm = { customerId: string; issueDate: string; dueDate: string; description: string; revenueAccountId: string; lineItems: LineItem[] }
type ReceiptForm = { bankAccountId: string; amount: string; receiptDate: string; notes: string }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground',
  UNPAID: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PARTIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  OVERDUE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  VOID: 'bg-muted text-brand-muted-light line-through',
}
const STATUS_TABS = ['ALL', 'UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']
const DEFAULT_TAX_SETTINGS: TaxSettings = { taxName: 'Tax', taxRate: 0, taxEnabled: true, taxInclusive: false, taxAppliedByDefault: true }
function blankLine(tax: TaxSettings): LineItem {
  return { description: '', quantity: '1', unitPrice: '', taxRate: tax.taxEnabled && tax.taxAppliedByDefault ? String(tax.taxRate) : '0' }
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status}</span>
}

export default function SalesInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState('ALL')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [receiptTarget, setReceiptTarget] = useState<Invoice | null>(null)
  const revenueAccounts = useMemo(() => glAccounts.filter((a) => a.account_type === 'REVENUE'), [glAccounts])
  const defaultRevenueAccountId = useMemo(
    () => revenueAccounts.find((a) => a.account_name === 'Guarding Services')?.id ?? revenueAccounts[0]?.id ?? '',
    [revenueAccounts],
  )

  // Invoice form
  const { register: invReg, handleSubmit: invSubmit, control: invCtrl, reset: invReset, setValue: invSetValue, formState: { isSubmitting: invSubmitting, errors: invErrors } } = useForm<InvoiceForm>({
    defaultValues: { customerId: '', issueDate: '', dueDate: '', description: '', revenueAccountId: '', lineItems: [blankLine(DEFAULT_TAX_SETTINGS)] },
  })
  const { fields, append, remove } = useFieldArray({ control: invCtrl, name: 'lineItems' })
  const watchedItems = useWatch({ control: invCtrl, name: 'lineItems' }) ?? []
  const totals = useMemo(() => {
    const { subtotal, taxAmount, totalAmount } = calculateInvoiceTotals(
      watchedItems.map((item) => ({ quantity: Number(item?.quantity) || 0, unitPrice: Number(item?.unitPrice) || 0, taxRate: taxSettings.taxEnabled ? Number(item?.taxRate) || 0 : 0 })),
      0,
      taxSettings.taxInclusive,
    )
    return { subTotal: subtotal, taxTotal: taxAmount, totalAmount }
  }, [watchedItems, taxSettings])

  // Receipt form
  const { register: rcpReg, handleSubmit: rcpSubmit, reset: rcpReset, formState: { isSubmitting: rcpSubmitting } } = useForm<ReceiptForm>({
    defaultValues: { bankAccountId: '', amount: '', receiptDate: '', notes: '' },
  })

  async function fetchInvoices() {
    setLoading(true)
    fetchSummary()
    try {
      const params = new URLSearchParams()
      if (statusTab !== 'ALL') params.set('status', statusTab)
      const res = await fetch(`/api/finance/sales-invoices?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load sales invoices'); setInvoices([]); return }
      setInvoices(json.invoices ?? [])
    } catch {
      toast.error('Network error loading sales invoices')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchSupporting() {
    try {
      const [custRes, bankRes, glRes] = await Promise.all([
        fetch('/api/finance/customers'),
        fetch('/api/finance/bank-accounts'),
        fetch('/api/finance/accounts'),
      ])
      const custJson = await custRes.json()
      const bankJson = await bankRes.json()
      const glJson = await glRes.json()
      setCustomers(custJson.customers ?? [])
      setBankAccounts(bankJson.accounts ?? [])
      setGlAccounts(glJson.accounts ?? [])
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchTaxSettings() {
    try {
      const res = await fetch('/api/settings')
      const json = await res.json()
      if (res.ok && json.company) {
        setTaxSettings({
          taxName: json.company.taxName || 'Tax',
          taxRate: Number(json.company.taxRate) || 0,
          taxEnabled: json.company.taxEnabled ?? true,
          taxInclusive: json.company.taxInclusive ?? false,
          taxAppliedByDefault: json.company.taxAppliedByDefault ?? true,
        })
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { fetchInvoices() }, [statusTab])
  useEffect(() => { fetchSupporting(); fetchTaxSettings() }, [])

  // GL accounts load asynchronously, so if the dialog was already open when
  // they arrived, backfill the revenue account default rather than leaving
  // the field blank.
  useEffect(() => {
    if (showCreateDialog && defaultRevenueAccountId) {
      invSetValue('revenueAccountId', defaultRevenueAccountId, { shouldValidate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateDialog, defaultRevenueAccountId])

  // Summary cards come from the server's SQL totals over every invoice
  // (unfiltered by status tab). Summing the first page in the browser
  // undercounted as soon as there were more than 25 invoices (BUG-012).
  const [stats, setStats] = useState({ totalInvoiced: 0, totalPaid: 0, outstanding: 0, overdue: 0 })
  function fetchSummary() {
    fetch('/api/finance/sales-invoices?limit=1').then(r => r.json()).then(j => { if (j.summary) setStats(j.summary) }).catch((err) => console.error(err))
  }

  async function onCreateInvoice(data: InvoiceForm) {
    const payload = {
      ...data,
      lineItems: data.lineItems.filter((l) => l.description).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity) || 1,
        unitPrice: Number(l.unitPrice) || 0,
        taxRate: Number(l.taxRate) || 0,
      })),
    }
    const res = await fetch('/api/finance/sales-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Invoice ${json.invoice.invoiceNumber} created`)
    setShowCreateDialog(false)
    invReset()
    fetchInvoices()
  }

  function openRecordReceipt(invoice: Invoice) {
    setReceiptTarget(invoice)
    rcpReset({ bankAccountId: '', amount: String(Number(invoice.balanceDue).toFixed(2)), receiptDate: new Date().toISOString().split('T')[0], notes: '' })
  }

  async function onRecordReceipt(data: ReceiptForm) {
    if (!receiptTarget) return
    const res = await fetch('/api/finance/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankAccountId: data.bankAccountId,
        amount: Number(data.amount),
        receiptDate: data.receiptDate,
        invoiceId: receiptTarget.id,
        customerId: receiptTarget.customer.id,
        notes: data.notes,
        payer: receiptTarget.customer.name,
      }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Receipt ${json.receipt.reference} recorded`)
    setReceiptTarget(null)
    fetchInvoices()
  }

  async function voidInvoice(invoice: Invoice) {
    if (!confirm(`Void invoice ${invoice.invoiceNumber}?`)) return
    const res = await fetch(`/api/finance/sales-invoices/${invoice.id}?action=void`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Invoice voided')
    fetchInvoices()
  }

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        description="Create and manage customer invoices"
        action={<Button type="button" onClick={() => { invReset({ customerId: '', issueDate: '', dueDate: '', description: '', revenueAccountId: defaultRevenueAccountId, lineItems: [blankLine(taxSettings)] }); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Invoice</Button>}
      />

      {/* Summary Cards */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Invoiced', value: stats.totalInvoiced, color: 'text-foreground' },
          { label: 'Total Paid', value: stats.totalPaid, color: 'text-green-600' },
          { label: 'Outstanding', value: stats.outstanding, color: 'text-amber-600' },
          { label: 'Overdue', value: stats.overdue, color: 'text-red-600' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{formatCurrency(stat.value)}</p>
          </div>
        ))}
      </div>

      {/* Status Tabs */}
      <div className="mt-5 flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setStatusTab(tab)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${statusTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={DocumentRegular} title="No invoices found" description={statusTab === 'ALL' ? 'Create your first invoice to get started' : `No ${statusTab.toLowerCase()} invoices`} action={statusTab === 'ALL' ? <Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Create your first invoice</Button> : undefined} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invoice #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
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
                  <tr key={inv.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{inv.customer?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(inv.issueDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(inv.dueDate))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(inv.totalAmount), inv.currency)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatCurrency(Number(inv.paidAmount), inv.currency)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(Number(inv.balanceDue), inv.currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {inv.status !== 'VOID' && inv.status !== 'PAID' && (
                          <button type="button" onClick={() => openRecordReceipt(inv)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600" title="Record Receipt" aria-label="Record receipt">
                            <ReceiptRegular className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {inv.status !== 'VOID' && (
                          <button type="button" onClick={() => voidInvoice(inv)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Void" aria-label="Void invoice">
                            <ProhibitedRegular className="h-3.5 w-3.5" />
                          </button>
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

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Sales Invoice</DialogTitle></DialogHeader>
          <form onSubmit={invSubmit(onCreateInvoice)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <Controller control={invCtrl} name="customerId" render={({ field }) => (
                  <SearchableSelect
                    options={customers.map((c) => ({ value: c.id, label: c.name }))}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select customer"
                    searchPlaceholder="Search customers…"
                  />
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input placeholder="Invoice description" {...invReg('description')} />
              </div>
              <div className="space-y-1.5">
                <Label>Issue Date *</Label>
                <Input type="date" {...invReg('issueDate', { required: 'Required' })} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date *</Label>
                <Input type="date" {...invReg('dueDate', { required: 'Required' })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Revenue Account *</Label>
                <Controller control={invCtrl} name="revenueAccountId" rules={{ required: 'Revenue account is required' }} render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select revenue account" /></SelectTrigger>
                    <SelectContent>
                      {revenueAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
                {invErrors.revenueAccountId && <p className="text-xs text-red-600">{invErrors.revenueAccountId.message}</p>}
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="grid grid-cols-12 gap-2 mb-1 text-xs font-medium text-muted-foreground px-1">
                <div className={taxSettings.taxEnabled ? 'col-span-4' : 'col-span-5'}>Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                {taxSettings.taxEnabled && <div className="col-span-2 text-right">{taxSettings.taxName} %</div>}
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const qty = Number(watchedItems?.[index]?.quantity) || 0
                  const price = Number(watchedItems?.[index]?.unitPrice) || 0
                  const tax = taxSettings.taxEnabled ? Number(watchedItems?.[index]?.taxRate) || 0 : 0
                  const lineTotal = taxSettings.taxInclusive ? qty * price : qty * price * (1 + tax / 100)
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className={taxSettings.taxEnabled ? 'col-span-4' : 'col-span-5'}><Input className="h-8 text-xs" placeholder="Item description" {...invReg(`lineItems.${index}.description`)} /></div>
                      <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="1" min="0" placeholder="1" {...invReg(`lineItems.${index}.quantity`)} /></div>
                      <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" placeholder="0.00" {...invReg(`lineItems.${index}.unitPrice`)} /></div>
                      {taxSettings.taxEnabled && <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" max="100" placeholder="0" {...invReg(`lineItems.${index}.taxRate`)} /></div>}
                      <div className="col-span-1 text-right text-xs font-medium text-foreground">{formatCurrency(lineTotal)}</div>
                      <div className="col-span-1 flex justify-center">
                        <button type="button" onClick={() => remove(index)} disabled={fields.length <= 1} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-400 disabled:opacity-30" aria-label="Remove line">
                          <DeleteRegular className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={() => append(blankLine(taxSettings))} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                <AddRegular className="h-3 w-3" /> Add Line
              </button>
            </div>

            <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1 text-right">
              <div className="text-muted-foreground">Sub-total: <strong>{formatCurrency(totals.subTotal)}</strong></div>
              {taxSettings.taxEnabled && <div className="text-muted-foreground">{taxSettings.taxName}: <strong>{formatCurrency(totals.taxTotal)}</strong></div>}
              <div className="text-foreground font-bold text-base">Total: {formatCurrency(totals.totalAmount)}</div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={invSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {invSubmitting ? 'Creating…' : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Receipt Dialog */}
      <Dialog open={!!receiptTarget} onOpenChange={(open) => !open && setReceiptTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Receipt — {receiptTarget?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={rcpSubmit(onRecordReceipt)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bank Account *</Label>
              <select className="w-full h-9 rounded-md border border-border px-3 text-sm" {...rcpReg('bankAccountId', { required: true })} aria-label="Bank account">
                <option value="">Select bank account</option>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" {...rcpReg('amount', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Receipt Date *</Label>
              <Input type="date" {...rcpReg('receiptDate', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" {...rcpReg('notes')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReceiptTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={rcpSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {rcpSubmitting ? 'Saving…' : 'Record Receipt'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
