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
import { calculateInvoiceTotals } from '@/lib/calculations'
import toast from 'react-hot-toast'
import { AddRegular, ArrowSwapRegular, DeleteRegular, DocumentRegular, ProhibitedRegular } from '@fluentui/react-icons'

interface ProformaInvoice {
  id: string
  proformaNumber: string
  issueDate: string
  validUntil: string
  totalAmount: number
  status: string
  convertedInvoiceId: string | null
  customer: { id: string; name: string }
}
interface Customer { id: string; name: string }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type ProformaForm = { customerId: string; issueDate: string; validUntil: string; notes: string; lineItems: LineItem[] }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground',
  SENT: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  CONVERTED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  EXPIRED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  VOID: 'bg-muted text-brand-muted-light line-through',
}
function blankLine(): LineItem { return { description: '', quantity: '1', unitPrice: '', taxRate: '0' } }
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status}</span>
}

export default function ProformaInvoicesPage() {
  const [rows, setRows] = useState<ProformaInvoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<ProformaForm>({
    defaultValues: { customerId: '', issueDate: '', validUntil: '', notes: '', lineItems: [blankLine()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' })
  const watchedItems = useWatch({ control, name: 'lineItems' }) ?? []
  const totals = useMemo(() => calculateInvoiceTotals(watchedItems.map((i) => ({ quantity: Number(i?.quantity) || 0, unitPrice: Number(i?.unitPrice) || 0, taxRate: Number(i?.taxRate) || 0 }))), [watchedItems])

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/proforma-invoices')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load proforma invoices'); setRows([]); return }
      setRows(json.proformaInvoices ?? [])
    } catch { toast.error('Network error loading proforma invoices'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => {
    fetch('/api/finance/customers').then((r) => r.json()).then((j) => setCustomers(j.customers ?? [])).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: ProformaForm) {
    const payload = { ...data, lineItems: data.lineItems.filter((l) => l.description).map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, taxRate: Number(l.taxRate) || 0 })) }
    const res = await fetch('/api/finance/proforma-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Proforma ${json.proformaInvoice.proformaNumber} created`)
    setShowCreateDialog(false)
    reset({ customerId: '', issueDate: '', validUntil: '', notes: '', lineItems: [blankLine()] })
    fetchRows()
  }

  async function convertToInvoice(row: ProformaInvoice) {
    if (!confirm(`Convert ${row.proformaNumber} to a sales invoice?`)) return
    const res = await fetch(`/api/finance/proforma-invoices/${row.id}?action=convert-to-invoice`, { method: 'PUT' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Converted to invoice ${json.invoiceNumber}`)
    fetchRows()
  }

  async function voidProforma(row: ProformaInvoice) {
    if (!confirm(`Void ${row.proformaNumber}?`)) return
    const res = await fetch(`/api/finance/proforma-invoices/${row.id}?action=void`, { method: 'PUT' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Proforma invoice voided')
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Proforma Invoices"
        description="Non-binding price quotes ahead of a real invoice"
        action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Proforma</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={DocumentRegular} title="No proforma invoices found" description="Create your first proforma invoice" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Proforma #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Issue Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Valid Until</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{row.proformaNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.customer?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.issueDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.validUntil))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(row.totalAmount))}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.status !== 'VOID' && row.status !== 'EXPIRED' && !row.convertedInvoiceId && (
                          <button type="button" onClick={() => convertToInvoice(row)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600" title="Convert to Invoice" aria-label="Convert to invoice">
                            <ArrowSwapRegular className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {row.status !== 'VOID' && !row.convertedInvoiceId && (
                          <button type="button" onClick={() => voidProforma(row)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Void" aria-label="Void proforma">
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
          <DialogHeader><DialogTitle>New Proforma Invoice</DialogTitle></DialogHeader>
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
                <Label>Notes</Label>
                <Input placeholder="Optional notes" {...register('notes')} />
              </div>
              <div className="space-y-1.5">
                <Label>Issue Date *</Label>
                <Input type="date" {...register('issueDate', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid Until *</Label>
                <Input type="date" {...register('validUntil', { required: true })} />
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
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Creating…' : 'Create Proforma'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
