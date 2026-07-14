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
import { AddRegular, ArrowCircleDownRegular } from '@fluentui/react-icons';

interface Receipt {
  id: string
  reference: string
  receiptDate: string
  payer: string
  amount: number
  method: string
  bankAccount: { bankName: string; accountNumber: string }
  customer?: { name: string } | null
}

interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string }
interface Customer { id: string; name: string }
interface SalesInvoice { id: string; invoiceNumber: string; balanceDue: number }

type FormValues = {
  bankAccountId: string
  receiptDate: string
  payer: string
  amount: string
  method: string
  customerId: string
  invoiceId: string
  notes: string
}

const METHODS = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER']

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerInvoices, setCustomerInvoices] = useState<SalesInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { bankAccountId: '', receiptDate: new Date().toISOString().split('T')[0], payer: '', amount: '', method: 'BANK_TRANSFER', customerId: '', invoiceId: '', notes: '' },
  })
  const selectedCustomerId = watch('customerId')

  useEffect(() => {
    if (!selectedCustomerId) { setCustomerInvoices([]); return }
    fetch(`/api/finance/sales-invoices?customerId=${selectedCustomerId}&status=UNPAID`)
      .then((r) => r.json())
      .then((j) => setCustomerInvoices(j.invoices ?? []))
      .catch(() => setCustomerInvoices([]))
  }, [selectedCustomerId])

  async function fetchReceipts() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/receipts')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load receipts'); setReceipts([]); return }
      setReceipts(json.receipts ?? [])
    } catch {
      toast.error('Network error loading receipts')
      setReceipts([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchSupporting() {
    try {
      const [bankRes, custRes] = await Promise.all([
        fetch('/api/finance/bank-accounts'),
        fetch('/api/finance/customers'),
      ])
      const bankJson = await bankRes.json()
      const custJson = await custRes.json()
      setBankAccounts(bankJson.accounts ?? [])
      setCustomers(custJson.customers ?? [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { fetchReceipts() }, [])
  useEffect(() => { fetchSupporting() }, [])

  function openCreate() {
    reset({ bankAccountId: '', receiptDate: new Date().toISOString().split('T')[0], payer: '', amount: '', method: 'BANK_TRANSFER', customerId: '', invoiceId: '', notes: '' })
    setCustomerInvoices([])
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const payload: Record<string, unknown> = {
      bankAccountId: data.bankAccountId,
      receiptDate: data.receiptDate,
      payer: data.payer,
      amount: Number(data.amount),
      method: data.method,
      notes: data.notes || undefined,
    }
    if (data.customerId) payload.customerId = data.customerId
    if (data.invoiceId) payload.invoiceId = data.invoiceId

    const res = await fetch('/api/finance/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Receipt ${json.receipt.reference} recorded`)
    setShowDialog(false)
    fetchReceipts()
  }

  return (
    <div>
      <PageHeader
        title="Receipts"
        description="Record incoming payments from customers"
        action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Record Receipt</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-3 flex-1 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={ArrowCircleDownRegular}
              title="No receipts recorded"
              description="Record your first incoming receipt"
              action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Record Receipt</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Payer</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bank Account</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Method</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-medium">{r.reference}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(r.receiptDate))}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.payer}</td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{r.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {r.bankAccount?.bankName} <span className="font-mono">{r.bankAccount?.accountNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{r.method.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(Number(r.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Receipt Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Receipt</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bank Account *</Label>
              <Controller control={control} name="bankAccountId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.bankName} — {b.accountNumber} ({b.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" {...register('receiptDate', { required: 'Required' })} />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Controller control={control} name="method" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Payer *</Label>
              <Input placeholder="Who paid?" {...register('payer', { required: 'Required' })} />
            </div>

            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register('amount', { required: 'Required' })} />
            </div>

            <div className="space-y-1.5">
              <Label>Customer (optional)</Label>
              <Controller control={control} name="customerId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Link to customer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not linked</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>

            {selectedCustomerId && customerInvoices.length > 0 && (
              <div className="space-y-1.5">
                <Label>Apply to Invoice (optional)</Label>
                <Controller control={control} name="invoiceId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No specific invoice</SelectItem>
                      {customerInvoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} — {formatCurrency(Number(inv.balanceDue))} due
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" {...register('notes')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {isSubmitting ? 'Saving…' : 'Record Receipt'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
