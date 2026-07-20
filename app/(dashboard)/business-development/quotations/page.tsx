'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form'
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
import { AddRegular, DeleteRegular, DocumentRegular, PrintRegular } from '@fluentui/react-icons';

interface QuotationItem { id: string; description: string; quantity: number; unitPrice: number; taxRate: number; lineTotal: number }
interface Quotation { id: string; quoteNumber: string; status: string; issueDate: string; validUntil: string | null; subtotal: number; taxAmount: number; totalAmount: number; notes: string | null; convertedInvoiceId: string | null; customer: { id: string; name: string } | null; lead: { id: string; companyName: string } | null; items?: QuotationItem[] }
interface Customer { id: string; name: string }
interface Lead { id: string; companyName: string }
interface TaxSettings { taxName: string; taxRate: number; taxNumber: string | null; taxEnabled: boolean; taxInclusive: boolean; taxAppliedByDefault: boolean }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type FormValues = { linkType: 'customer' | 'lead'; customerId: string; leadId: string; issueDate: string; validUntil: string; notes: string; items: LineItem[] }

const STATUS_STYLES: Record<string, string> = { DRAFT: 'bg-muted text-muted-foreground', SENT: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', ACCEPTED: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', REJECTED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300', EXPIRED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' }
const DEFAULT_TAX_SETTINGS: TaxSettings = { taxName: 'Tax', taxRate: 0, taxNumber: null, taxEnabled: true, taxInclusive: false, taxAppliedByDefault: true }

function blankItem(tax: TaxSettings): LineItem {
  return { description: '', quantity: '1', unitPrice: '', taxRate: tax.taxEnabled && tax.taxAppliedByDefault ? String(tax.taxRate) : '0' }
}

function calcLineTotals(items: LineItem[], tax: TaxSettings) {
  const { subTotal, taxTotal, totalAmount } = calculateInvoiceTotals(
    items.map((item) => ({ quantity: Number(item.quantity) || 0, unitPrice: Number(item.unitPrice) || 0, taxRate: tax.taxEnabled ? Number(item.taxRate) || 0 : 0 })),
    0,
    tax.taxInclusive,
  )
  return { subtotal: subTotal ?? 0, taxAmount: taxTotal ?? 0, totalAmount }
}

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null)
  const [converting, setConverting] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { linkType: 'customer', customerId: '', leadId: '', issueDate: new Date().toISOString().split('T')[0], validUntil: '', notes: '', items: [blankItem(DEFAULT_TAX_SETTINGS)] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' })
  const linkType = watch('linkType')
  const totals = calcLineTotals(watchedItems ?? [], taxSettings)

  async function fetchQuotations() {
    setLoading(true)
    try {
      const res = await fetch('/api/bd/quotations')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load quotations'); setQuotations([]); return }
      setQuotations(json.quotations ?? [])
    } catch {
      toast.error('Network error loading quotations')
      setQuotations([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchQuotations() }, [])
  useEffect(() => {
    Promise.all([fetch('/api/bd/customers').then(r => r.json()), fetch('/api/bd/leads').then(r => r.json())]).then(([c, l]) => {
      setCustomers(c.customers ?? []); setLeads(l.leads ?? [])
    }).catch((err) => console.error(err))
    fetch('/api/settings').then(r => r.json()).then((settings) => {
      if (settings.company) {
        setTaxSettings({
          taxName: settings.company.taxName || 'Tax',
          taxRate: Number(settings.company.taxRate) || 0,
          taxNumber: settings.company.taxNumber ?? null,
          taxEnabled: settings.company.taxEnabled ?? true,
          taxInclusive: settings.company.taxInclusive ?? false,
          taxAppliedByDefault: settings.company.taxAppliedByDefault ?? true,
        })
      }
    }).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: FormValues) {
    const payload = {
      customerId: data.linkType === 'customer' ? data.customerId || null : null,
      leadId: data.linkType === 'lead' ? data.leadId || null : null,
      issueDate: data.issueDate, validUntil: data.validUntil || null, notes: data.notes || null,
      items: data.items.map(i => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), taxRate: Number(i.taxRate) })),
    }
    const res = await fetch('/api/bd/quotations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Quotation ${json.quotation.quoteNumber} created`)
    setShowCreateDialog(false); reset(); fetchQuotations()
  }

  async function updateStatus(q: Quotation, status: string) {
    const res = await fetch(`/api/bd/quotations/${q.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!res.ok) { toast.error('Failed'); return }
    toast.success('Status updated'); fetchQuotations()
  }

  async function convertToInvoice() {
    if (!convertTarget) return
    setConverting(true)
    try {
      const res = await fetch(`/api/bd/quotations/${convertTarget.id}?action=convert-to-invoice`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success(`Invoice ${json.invoiceNumber} created successfully`, { duration: 6000 })
      setConvertTarget(null); fetchQuotations()
    } finally { setConverting(false) }
  }

  async function deleteQuotation(q: Quotation) {
    if (!confirm(`Delete ${q.quoteNumber}?`)) return
    const res = await fetch(`/api/bd/quotations/${q.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Only DRAFT quotations can be deleted'); return }
    toast.success('Quotation deleted'); fetchQuotations()
  }

  async function printQuote(q: Quotation) {
    let items = q.items
    if (!items) {
      const res = await fetch(`/api/bd/quotations/${q.id}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load quotation'); return }
      items = json.quotation.items ?? []
    }

    const taxCol = taxSettings.taxEnabled ? `<th>${taxSettings.taxName}</th>` : ''
    const taxCell = (i: QuotationItem) => taxSettings.taxEnabled ? `<td>${i.taxRate}%</td>` : ''
    const taxRow = taxSettings.taxEnabled ? `<tr><td colspan="${taxSettings.taxEnabled ? 4 : 3}">${taxSettings.taxName}</td><td>${formatCurrency(Number(q.taxAmount))}</td></tr>` : ''
    const colspan = taxSettings.taxEnabled ? 4 : 3

    const w = window.open('', '_blank')!
    w.document.write(`<!DOCTYPE html><html><head><title>${q.quoteNumber}</title><style>body{font-family:sans-serif;padding:40px;max-width:700px;margin:0 auto}h1{color:#111827}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #E5E7EB;padding:8px 12px;text-align:left}th{background:#F8FAFC}tfoot td{font-weight:bold}.total{font-size:1.2em;color:#DC2626}</style></head><body>
      <h1>QUOTATION</h1><p><strong>Quote #:</strong> ${q.quoteNumber}</p>
      <p><strong>Date:</strong> ${formatDate(new Date(q.issueDate))}</p>
      ${q.validUntil ? `<p><strong>Valid Until:</strong> ${formatDate(new Date(q.validUntil))}</p>` : ''}
      ${taxSettings.taxNumber ? `<p><strong>Tax Reg No:</strong> ${taxSettings.taxNumber}</p>` : ''}
      <p><strong>To:</strong> ${q.customer?.name ?? q.lead?.companyName ?? '—'}</p>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th>${taxCol}<th>Total</th></tr></thead>
      <tbody>${(items ?? []).map(i => `<tr><td>${i.description}</td><td>${i.quantity}</td><td>${formatCurrency(Number(i.unitPrice))}</td>${taxCell(i)}<td>${formatCurrency(Number(i.lineTotal))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${colspan}">Subtotal</td><td>${formatCurrency(Number(q.subtotal))}</td></tr>
      ${taxRow}
      <tr><td colspan="${colspan}" class="total">TOTAL</td><td class="total">${formatCurrency(Number(q.totalAmount))}</td></tr></tfoot></table>
      ${q.notes ? `<p><em>${q.notes}</em></p>` : ''}</body></html>`)
    w.document.close(); w.print()
  }

  return (
    <div>
      <PageHeader title="Quotations" description="Create and manage sales quotations" action={<Button type="button" onClick={() => { reset({ linkType: 'customer', customerId: '', leadId: '', issueDate: new Date().toISOString().split('T')[0], validUntil: '', notes: '', items: [blankItem(taxSettings)] }); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Quote</Button>} />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : quotations.length === 0 ? (
          <div className="py-16"><EmptyState icon={DocumentRegular} title="No quotations yet" description="Create your first quotation for a lead or customer" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> New Quote</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Quote #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer / Lead</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Issue Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Valid Until</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{q.quoteNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{q.customer?.name ?? q.lead?.companyName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(q.issueDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{q.validUntil ? formatDate(new Date(q.validUntil)) : <span className="text-brand-muted-light">—</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(q.totalAmount))}</td>
                    <td className="px-4 py-3">
                      {['DRAFT', 'SENT'].includes(q.status) ? (
                        <select value={q.status} onChange={e => updateStatus(q, e.target.value)} className="text-xs rounded border border-border px-2 py-0.5 bg-card" aria-label="Quote status">
                          <option value="DRAFT">Draft</option>
                          <option value="SENT">Sent</option>
                          <option value="ACCEPTED">Accepted</option>
                          <option value="REJECTED">Declined</option>
                          <option value="EXPIRED">Expired</option>
                        </select>
                      ) : (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[q.status] ?? 'bg-muted text-muted-foreground'}`}>{q.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => printQuote(q)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Print quote"><PrintRegular className="h-3.5 w-3.5" /></button>
                        {q.status === 'ACCEPTED' && q.customer && !q.convertedInvoiceId && (
                          <button type="button" onClick={() => setConvertTarget(q)} className="text-xs text-brand-navy dark:text-white hover:underline font-medium" aria-label="Convert to invoice">→ Invoice</button>
                        )}
                        {q.status === 'DRAFT' && (
                          <button type="button" onClick={() => deleteQuotation(q)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Delete quote"><DeleteRegular className="h-3.5 w-3.5" /></button>
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

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-5">
            {/* Link to */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" value="customer" {...register('linkType')} className="accent-primary" /> Customer</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" value="lead" {...register('linkType')} className="accent-primary" /> Lead</label>
              </div>
              {linkType === 'customer' ? (
                <div className="space-y-1.5">
                  <Label>Customer *</Label>
                  <Controller control={control} name="customerId" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Lead *</Label>
                  <Controller control={control} name="leadId" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                      <SelectContent>{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.companyName}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Issue Date *</Label><Input type="date" {...register('issueDate', { required: true })} /></div>
              <div className="space-y-1.5"><Label>Valid Until</Label><Input type="date" {...register('validUntil')} /></div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => append(blankItem(taxSettings))}><AddRegular className="h-3.5 w-3.5 mr-1" /> Add Line</Button>
              </div>
              <div className="space-y-2">
                {fields.map((field, idx) => {
                  const qty = Number(watchedItems?.[idx]?.quantity) || 0
                  const up = Number(watchedItems?.[idx]?.unitPrice) || 0
                  const tr = taxSettings.taxEnabled ? Number(watchedItems?.[idx]?.taxRate) || 0 : 0
                  const gross = Math.round(qty * up * 100) / 100
                  const lineTotal = taxSettings.taxInclusive ? gross : Math.round(gross * (1 + tr / 100) * 100) / 100
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-1.5 items-center">
                      <div className={taxSettings.taxEnabled ? 'col-span-5' : 'col-span-7'}><Input placeholder="Description" {...register(`items.${idx}.description`)} /></div>
                      <div className="col-span-2"><Input type="number" placeholder="Qty" min="0" step="any" {...register(`items.${idx}.quantity`)} /></div>
                      <div className="col-span-2"><Input type="number" placeholder="Price" min="0" step="0.01" {...register(`items.${idx}.unitPrice`)} /></div>
                      {taxSettings.taxEnabled && (
                        <div className="col-span-2"><Input type="number" placeholder={`${taxSettings.taxName} %`} min="0" max="100" step="0.01" aria-label="Tax rate" {...register(`items.${idx}.taxRate`)} /></div>
                      )}
                      <div className="col-span-1 flex items-center justify-between gap-1">
                        <span className="text-xs text-muted-foreground hidden xl:block">{lineTotal > 0 ? formatCurrency(lineTotal) : ''}</span>
                        {fields.length > 1 && <button type="button" onClick={() => remove(idx)} className="p-1 text-brand-muted-light hover:text-primary" aria-label="Remove line"><DeleteRegular className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex justify-end text-sm space-y-0.5">
                <div className="text-right space-y-0.5">
                  <div className="flex gap-8 text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
                  {taxSettings.taxEnabled && <div className="flex gap-8 text-muted-foreground"><span>{taxSettings.taxName}</span><span>{formatCurrency(totals.taxAmount)}</span></div>}
                  <div className="flex gap-8 font-bold text-foreground"><span>Total</span><span>{formatCurrency(totals.totalAmount)}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Payment terms, conditions…" {...register('notes')} /></div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Creating…' : 'Create Quotation'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to Invoice Confirm */}
      <Dialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Convert to Invoice</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Convert <strong>{convertTarget?.quoteNumber}</strong> ({formatCurrency(Number(convertTarget?.totalAmount))}) to a sales invoice for <strong>{convertTarget?.customer?.name}</strong>?</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button type="button" disabled={converting} onClick={convertToInvoice} className="bg-primary hover:bg-brand-red-dark text-white">{converting ? 'Converting…' : 'Convert to Invoice'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
