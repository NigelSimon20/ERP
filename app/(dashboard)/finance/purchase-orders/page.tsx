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
import { AddRegular, CheckmarkCircleRegular, DeleteRegular, DismissCircleRegular, DocumentRegular } from '@fluentui/react-icons'

interface PurchaseOrder {
  id: string
  poNumber: string
  issueDate: string
  expectedDate: string | null
  totalAmount: number
  status: string
  supplier: { id: string; name: string }
}
interface Supplier { id: string; name: string }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type PoForm = { supplierId: string; issueDate: string; expectedDate: string; notes: string; lineItems: LineItem[] }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground',
  SENT: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  APPROVED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  RECEIVED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  CLOSED: 'bg-muted text-foreground',
  CANCELLED: 'bg-muted text-brand-muted-light line-through',
}
function blankLine(): LineItem { return { description: '', quantity: '1', unitPrice: '', taxRate: '0' } }
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status.replace('_', ' ')}</span>
}

export default function PurchaseOrdersPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<PoForm>({
    defaultValues: { supplierId: '', issueDate: '', expectedDate: '', notes: '', lineItems: [blankLine()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' })
  const watchedItems = useWatch({ control, name: 'lineItems' }) ?? []
  const totals = useMemo(() => calculateInvoiceTotals(watchedItems.map((i) => ({ quantity: Number(i?.quantity) || 0, unitPrice: Number(i?.unitPrice) || 0, taxRate: Number(i?.taxRate) || 0 }))), [watchedItems])

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/purchase-orders')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load purchase orders'); setRows([]); return }
      setRows(json.purchaseOrders ?? [])
    } catch { toast.error('Network error loading purchase orders'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => {
    fetch('/api/finance/suppliers').then((r) => r.json()).then((j) => setSuppliers(j.suppliers ?? [])).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: PoForm) {
    const payload = { ...data, lineItems: data.lineItems.filter((l) => l.description).map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, taxRate: Number(l.taxRate) || 0 })) }
    const res = await fetch('/api/finance/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Purchase order ${json.purchaseOrder.poNumber} created`)
    setShowCreateDialog(false)
    reset({ supplierId: '', issueDate: '', expectedDate: '', notes: '', lineItems: [blankLine()] })
    fetchRows()
  }

  async function approve(row: PurchaseOrder) {
    const res = await fetch(`/api/finance/purchase-orders/${row.id}?action=approve`, { method: 'PUT' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Purchase order approved')
    fetchRows()
  }

  async function cancel(row: PurchaseOrder) {
    if (!confirm(`Cancel ${row.poNumber}?`)) return
    const res = await fetch(`/api/finance/purchase-orders/${row.id}?action=cancel`, { method: 'PUT' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Purchase order cancelled')
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Order goods and services from suppliers ahead of receiving and billing"
        action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Purchase Order</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={DocumentRegular} title="No purchase orders found" description="Create your first purchase order" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">PO #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Issue Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Expected</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{row.poNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.supplier?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.issueDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.expectedDate ? formatDate(new Date(row.expectedDate)) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(row.totalAmount))}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(row.status === 'DRAFT' || row.status === 'SENT') && (
                          <button type="button" onClick={() => approve(row)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600" title="Approve" aria-label="Approve purchase order">
                            <CheckmarkCircleRegular className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!['RECEIVED', 'PARTIALLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(row.status) && (
                          <button type="button" onClick={() => cancel(row)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Cancel" aria-label="Cancel purchase order">
                            <DismissCircleRegular className="h-3.5 w-3.5" />
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
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <Controller control={control} name="supplierId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
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
                <Label>Expected Date</Label>
                <Input type="date" {...register('expectedDate')} />
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
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Creating…' : 'Create Purchase Order'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
