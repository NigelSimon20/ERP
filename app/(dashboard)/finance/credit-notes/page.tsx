'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateInvoiceTotals } from '@/lib/calculations'
import toast from 'react-hot-toast'
import { AddRegular, CheckmarkCircleRegular, DeleteRegular, DocumentRegular, ProhibitedRegular } from '@fluentui/react-icons'

interface CreditNote {
  id: string
  creditNoteNumber: string
  issueDate: string
  reason: string
  totalAmount: number
  status: string
  customer: { id: string; name: string }
}
interface Customer { id: string; name: string }
interface OpenInvoice { id: string; invoiceNumber: string; balanceDue: number }
interface GLAccount { id: string; account_name: string; account_code: string; account_type: string }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type CreditNoteForm = { customerId: string; salesInvoiceId: string; issueDate: string; reason: string; lineItems: LineItem[] }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground',
  ISSUED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  VOID: 'bg-muted text-brand-muted-light line-through',
}
function blankLine(): LineItem { return { description: '', quantity: '1', unitPrice: '', taxRate: '0' } }
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status}</span>
}

export default function CreditNotesPage() {
  const [rows, setRows] = useState<CreditNote[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [issueTarget, setIssueTarget] = useState<CreditNote | null>(null)
  const [issueAccountId, setIssueAccountId] = useState('')
  const revenueAccounts = useMemo(() => glAccounts.filter((a) => a.account_type === 'REVENUE'), [glAccounts])

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<CreditNoteForm>({
    defaultValues: { customerId: '', salesInvoiceId: 'none', issueDate: '', reason: '', lineItems: [blankLine()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' })
  const watchedItems = useWatch({ control, name: 'lineItems' }) ?? []
  // A2: a credit note can be applied to one of the customer's open invoices.
  const watchedCustomer = useWatch({ control, name: 'customerId' })
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  useEffect(() => {
    if (!watchedCustomer) { setOpenInvoices([]); return }
    fetch(`/api/finance/sales-invoices?customerId=${watchedCustomer}&limit=100`).then((r) => r.json())
      .then((j) => setOpenInvoices((j.invoices ?? []).filter((i: OpenInvoice & { status: string }) => i.status !== 'VOID' && Number(i.balanceDue) > 0)))
      .catch(() => setOpenInvoices([]))
  }, [watchedCustomer])
  const totals = useMemo(() => calculateInvoiceTotals(watchedItems.map((i) => ({ quantity: Number(i?.quantity) || 0, unitPrice: Number(i?.unitPrice) || 0, taxRate: Number(i?.taxRate) || 0 }))), [watchedItems])

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/credit-notes')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load credit notes'); setRows([]); return }
      setRows(json.creditNotes ?? [])
    } catch { toast.error('Network error loading credit notes'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => {
    fetch('/api/finance/customers').then((r) => r.json()).then((j) => setCustomers(j.customers ?? [])).catch((err) => console.error(err))
    fetch('/api/finance/accounts').then((r) => r.json()).then((j) => setGlAccounts(j.accounts ?? [])).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: CreditNoteForm) {
    const payload = { ...data, salesInvoiceId: data.salesInvoiceId === 'none' ? undefined : data.salesInvoiceId, lineItems: data.lineItems.filter((l) => l.description).map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, taxRate: Number(l.taxRate) || 0 })) }
    const res = await fetch('/api/finance/credit-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Credit note ${json.creditNote.creditNoteNumber} created (DRAFT)`)
    setShowCreateDialog(false)
    reset({ customerId: '', salesInvoiceId: 'none', issueDate: '', reason: '', lineItems: [blankLine()] })
    fetchRows()
  }

  function openIssue(row: CreditNote) {
    setIssueTarget(row)
    setIssueAccountId(revenueAccounts[0]?.id ?? '')
  }

  async function confirmIssue() {
    if (!issueTarget) return
    if (!issueAccountId) { toast.error('Select a revenue account'); return }
    const res = await fetch(`/api/finance/credit-notes/${issueTarget.id}?action=issue`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revenueAccountId: issueAccountId }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`${issueTarget.creditNoteNumber} issued and posted to the GL`)
    setIssueTarget(null)
    fetchRows()
  }

  async function voidRow(row: CreditNote) {
    if (!confirm(`Void ${row.creditNoteNumber}? ${row.status === 'ISSUED' ? 'This reverses its GL posting.' : ''}`)) return
    const res = await fetch(`/api/finance/credit-notes/${row.id}?action=void`, { method: 'PUT' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Credit note voided')
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Credit Notes"
        description="Reduce a customer's outstanding balance for returns, discounts, or corrections"
        action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Credit Note</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={DocumentRegular} title="No credit notes found" description="Create your first credit note" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Credit Note #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Issue Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{row.creditNoteNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.customer?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.issueDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{row.reason}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(row.totalAmount))}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.status === 'DRAFT' && (
                          <button type="button" onClick={() => openIssue(row)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600" title="Issue" aria-label="Issue credit note">
                            <CheckmarkCircleRegular className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {row.status !== 'VOID' && (
                          <button type="button" onClick={() => voidRow(row)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Void" aria-label="Void credit note">
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

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Credit Note</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <Controller control={control} name="customerId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Issue Date *</Label>
                <Input type="date" {...register('issueDate', { required: true })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Apply to invoice</Label>
                <Controller control={control} name="salesInvoiceId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No invoice (unapplied customer credit)</SelectItem>
                      {openInvoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.invoiceNumber} — {Number(i.balanceDue).toFixed(2)} due</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Reason *</Label>
                <Textarea placeholder="Why is this credit note being issued?" {...register('reason', { required: true })} />
              </div>
            </div>

            <div>
              <div className="grid grid-cols-12 gap-2 mb-1 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-5">Description</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2 text-right">Tax %</div>
                <div className="col-span-1" />
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5"><Input className="h-8 text-xs" placeholder="Item description" {...register(`lineItems.${index}.description`)} /></div>
                    <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="1" min="0" {...register(`lineItems.${index}.quantity`)} /></div>
                    <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" {...register(`lineItems.${index}.unitPrice`)} /></div>
                    <div className="col-span-2"><Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" max="100" {...register(`lineItems.${index}.taxRate`)} /></div>
                    <div className="col-span-1 flex justify-center">
                      <button type="button" onClick={() => remove(index)} disabled={fields.length <= 1} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-400 disabled:opacity-30" aria-label="Remove line">
                        <DeleteRegular className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => append(blankLine())} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                <AddRegular className="h-3 w-3" /> Add Line
              </button>
            </div>

            <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1 text-right">
              <div className="text-muted-foreground">Sub-total: <strong>{formatCurrency(totals.subtotal)}</strong></div>
              <div className="text-muted-foreground">Tax: <strong>{formatCurrency(totals.taxAmount)}</strong></div>
              <div className="text-foreground font-bold text-base">Total: {formatCurrency(totals.totalAmount)}</div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Creating…' : 'Save as Draft'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issueTarget} onOpenChange={(open) => !open && setIssueTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Issue {issueTarget?.creditNoteNumber}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Issuing posts this credit note to the general ledger and reduces the customer's outstanding balance. Choose the revenue account to debit.</p>
            <div className="space-y-1.5">
              <Label>Revenue Account *</Label>
              <Select onValueChange={setIssueAccountId} value={issueAccountId}>
                <SelectTrigger><SelectValue placeholder="Select revenue account" /></SelectTrigger>
                <SelectContent>{revenueAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIssueTarget(null)}>Cancel</Button>
              <Button type="button" onClick={confirmIssue} className="bg-primary hover:bg-brand-red-dark text-white">Issue Credit Note</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
