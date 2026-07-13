'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form'
import { FaPlus, FaTrash, FaFileAlt, FaPrint } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface QuotationItem { id: string; description: string; quantity: number; unitPrice: number; taxRate: number; lineTotal: number }
interface Quotation { id: string; quoteNumber: string; status: string; issueDate: string; validUntil: string | null; subtotal: number; taxAmount: number; totalAmount: number; notes: string | null; customer: { id: string; name: string } | null; lead: { id: string; companyName: string } | null; items: QuotationItem[] }
interface Customer { id: string; name: string }
interface Lead { id: string; companyName: string }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRate: string }
type FormValues = { linkType: 'customer' | 'lead'; customerId: string; leadId: string; issueDate: string; validUntil: string; notes: string; items: LineItem[] }

const STATUS_STYLES: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', SENT: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-green-100 text-green-700', DECLINED: 'bg-red-100 text-red-600', EXPIRED: 'bg-amber-100 text-amber-700', CONVERTED: 'bg-purple-100 text-purple-700' }
const TAX_RATES = [0, 5, 10, 14.5, 15, 20]

function calcLineTotals(items: LineItem[]) {
  let subtotal = 0; let taxAmount = 0
  for (const item of items) {
    const qty = Number(item.quantity) || 0; const up = Number(item.unitPrice) || 0; const tr = Number(item.taxRate) || 0
    const s = Math.round(qty * up * 100) / 100; const t = Math.round(s * (tr / 100) * 100) / 100
    subtotal += s; taxAmount += t
  }
  return { subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxAmount * 100) / 100, totalAmount: Math.round((subtotal + taxAmount) * 100) / 100 }
}

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Quotation | null>(null)
  const [converting, setConverting] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { linkType: 'customer', customerId: '', leadId: '', issueDate: new Date().toISOString().split('T')[0], validUntil: '', notes: '', items: [{ description: '', quantity: '1', unitPrice: '', taxRate: '0' }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' })
  const linkType = watch('linkType')
  const totals = calcLineTotals(watchedItems ?? [])

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

  function printQuote(q: Quotation) {
    const w = window.open('', '_blank')!
    w.document.write(`<!DOCTYPE html><html><head><title>${q.quoteNumber}</title><style>body{font-family:sans-serif;padding:40px;max-width:700px;margin:0 auto}h1{color:#0D1B2A}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}th{background:#f9fafb}tfoot td{font-weight:bold}.total{font-size:1.2em;color:#CC0000}</style></head><body>
      <h1>QUOTATION</h1><p><strong>Quote #:</strong> ${q.quoteNumber}</p>
      <p><strong>Date:</strong> ${formatDate(new Date(q.issueDate))}</p>
      ${q.validUntil ? `<p><strong>Valid Until:</strong> ${formatDate(new Date(q.validUntil))}</p>` : ''}
      <p><strong>To:</strong> ${q.customer?.name ?? q.lead?.companyName ?? '—'}</p>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Tax</th><th>Total</th></tr></thead>
      <tbody>${q.items.map(i => `<tr><td>${i.description}</td><td>${i.quantity}</td><td>${formatCurrency(Number(i.unitPrice))}</td><td>${i.taxRate}%</td><td>${formatCurrency(Number(i.lineTotal))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Subtotal</td><td>${formatCurrency(Number(q.subtotal))}</td></tr>
      <tr><td colspan="4">Tax</td><td>${formatCurrency(Number(q.taxAmount))}</td></tr>
      <tr><td colspan="4" class="total">TOTAL</td><td class="total">${formatCurrency(Number(q.totalAmount))}</td></tr></tfoot></table>
      ${q.notes ? `<p><em>${q.notes}</em></p>` : ''}</body></html>`)
    w.document.close(); w.print()
  }

  return (
    <div>
      <PageHeader title="Quotations" description="Create and manage sales quotations" action={<Button type="button" onClick={() => { reset(); setShowCreateDialog(true) }} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> New Quote</Button>} />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : quotations.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaFileAlt} title="No quotations yet" description="Create your first quotation for a lead or customer" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> New Quote</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Quote #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Customer / Lead</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Issue Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Valid Until</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{q.quoteNumber}</td>
                    <td className="px-4 py-3 font-medium text-[#0D1B2A]">{q.customer?.name ?? q.lead?.companyName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(new Date(q.issueDate))}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{q.validUntil ? formatDate(new Date(q.validUntil)) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(q.totalAmount))}</td>
                    <td className="px-4 py-3">
                      {['DRAFT', 'SENT'].includes(q.status) ? (
                        <select value={q.status} onChange={e => updateStatus(q, e.target.value)} className="text-xs rounded border border-gray-200 px-2 py-0.5 bg-white" aria-label="Quote status">
                          <option value="DRAFT">Draft</option>
                          <option value="SENT">Sent</option>
                          <option value="ACCEPTED">Accepted</option>
                          <option value="DECLINED">Declined</option>
                          <option value="EXPIRED">Expired</option>
                        </select>
                      ) : (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[q.status] ?? 'bg-gray-100 text-gray-600'}`}>{q.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => printQuote(q)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" aria-label="Print quote"><FaPrint className="h-3.5 w-3.5" /></button>
                        {q.status === 'ACCEPTED' && q.customer && (
                          <button type="button" onClick={() => setConvertTarget(q)} className="text-xs text-purple-600 hover:underline font-medium" aria-label="Convert to invoice">→ Invoice</button>
                        )}
                        {q.status === 'DRAFT' && (
                          <button type="button" onClick={() => deleteQuotation(q)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Delete quote"><FaTrash className="h-3.5 w-3.5" /></button>
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
            <div className="rounded-lg bg-gray-50 p-3 space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" value="customer" {...register('linkType')} className="accent-[#CC0000]" /> Customer</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" value="lead" {...register('linkType')} className="accent-[#CC0000]" /> Lead</label>
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
                <Button type="button" size="sm" variant="outline" onClick={() => append({ description: '', quantity: '1', unitPrice: '', taxRate: '0' })}><FaPlus className="h-3.5 w-3.5 mr-1" /> Add Line</Button>
              </div>
              <div className="space-y-2">
                {fields.map((field, idx) => {
                  const qty = Number(watchedItems?.[idx]?.quantity) || 0
                  const up = Number(watchedItems?.[idx]?.unitPrice) || 0
                  const tr = Number(watchedItems?.[idx]?.taxRate) || 0
                  const lineTotal = Math.round(qty * up * (1 + tr / 100) * 100) / 100
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-1.5 items-center">
                      <div className="col-span-5"><Input placeholder="Description" {...register(`items.${idx}.description`)} /></div>
                      <div className="col-span-2"><Input type="number" placeholder="Qty" min="0" step="any" {...register(`items.${idx}.quantity`)} /></div>
                      <div className="col-span-2"><Input type="number" placeholder="Price" min="0" step="0.01" {...register(`items.${idx}.unitPrice`)} /></div>
                      <div className="col-span-2">
                        <select className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm" aria-label="Tax rate" {...register(`items.${idx}.taxRate`)}>
                          {TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </div>
                      <div className="col-span-1 flex items-center justify-between gap-1">
                        <span className="text-xs text-gray-500 hidden xl:block">{lineTotal > 0 ? formatCurrency(lineTotal) : ''}</span>
                        {fields.length > 1 && <button type="button" onClick={() => remove(idx)} className="p-1 text-gray-400 hover:text-red-500" aria-label="Remove line"><FaTrash className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex justify-end text-sm space-y-0.5">
                <div className="text-right space-y-0.5">
                  <div className="flex gap-8 text-gray-500"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
                  <div className="flex gap-8 text-gray-500"><span>Tax</span><span>{formatCurrency(totals.taxAmount)}</span></div>
                  <div className="flex gap-8 font-bold text-[#0D1B2A]"><span>Total</span><span>{formatCurrency(totals.totalAmount)}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="Payment terms, conditions…" {...register('notes')} /></div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Creating…' : 'Create Quotation'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to Invoice Confirm */}
      <Dialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Convert to Invoice</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Convert <strong>{convertTarget?.quoteNumber}</strong> ({formatCurrency(Number(convertTarget?.totalAmount))}) to a sales invoice for <strong>{convertTarget?.customer?.name}</strong>?</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button type="button" disabled={converting} onClick={convertToInvoice} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{converting ? 'Converting…' : 'Convert to Invoice'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
