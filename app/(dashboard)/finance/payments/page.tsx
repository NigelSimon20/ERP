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
import { AddRegular, ArrowDownloadRegular, PaymentRegular } from '@fluentui/react-icons';

interface Payment {
  id: string
  reference: string
  paymentDate: string
  payee: string
  amount: number
  method: string
  notes: string | null
  bankAccount: { bankName: string; accountNumber: string }
}

interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string }
interface PurchaseInvoice { id: string; invoiceNumber: string; balanceDue: number }

type FormValues = {
  bankAccountId: string
  paymentDate: string
  payee: string
  amount: string
  method: string
  entityType: string
  invoiceId: string
  notes: string
}

const METHODS = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'MOBILE_MONEY', 'OTHER']

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { bankAccountId: '', paymentDate: new Date().toISOString().split('T')[0], payee: '', amount: '', method: 'BANK_TRANSFER', entityType: '', invoiceId: '', notes: '' },
  })
  const entityType = watch('entityType')

  async function fetchPayments() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/payments')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load payments'); setPayments([]); return }
      setPayments(json.payments ?? [])
    } catch {
      toast.error('Network error loading payments')
      setPayments([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchSupporting() {
    try {
      const bankRes = await fetch('/api/finance/bank-accounts')
      const bankJson = await bankRes.json()
      setBankAccounts(bankJson.accounts ?? [])
    } catch (err) {
      console.error(err)
    }
    try {
      const invRes = await fetch('/api/finance/purchase-invoices?status=UNPAID')
      const invJson = await invRes.json()
      setPurchaseInvoices(invJson.invoices ?? [])
    } catch { /* purchase invoices optional */ }
  }

  useEffect(() => { fetchPayments() }, [])
  useEffect(() => { fetchSupporting() }, [])

  function openCreate() {
    reset({ bankAccountId: '', paymentDate: new Date().toISOString().split('T')[0], payee: '', amount: '', method: 'BANK_TRANSFER', entityType: '', invoiceId: '', notes: '' })
    setShowDialog(true)
  }

  async function downloadPaymentPdf(p: Payment) {
    try {
      const { exportDocumentPdf } = await import('@/lib/pdf')
      let company: any = {}
      try {
        const settingsRes = await fetch('/api/settings')
        if (settingsRes.ok) company = (await settingsRes.json()).company ?? {}
      } catch { /* use defaults */ }
      await exportDocumentPdf('payment', {
        payment_number: p.reference,
        payment_date: p.paymentDate,
        party_name: p.payee,
        reference: p.reference,
        subtotal: p.amount,
        total_amount: p.amount,
        notes: p.notes,
      }, company)
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  async function onSubmit(data: FormValues) {
    const payload: Record<string, unknown> = {
      bankAccountId: data.bankAccountId,
      paymentDate: data.paymentDate,
      payee: data.payee,
      amount: Number(data.amount),
      method: data.method,
      notes: data.notes || undefined,
    }
    if (data.entityType === 'PURCHASE_INVOICE' && data.invoiceId) {
      payload.entityType = 'PURCHASE_INVOICE'
      payload.entityId = data.invoiceId
    }
    const res = await fetch('/api/finance/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Payment ${json.payment.reference} recorded`)
    setShowDialog(false)
    fetchPayments()
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record outgoing payments and supplier bills"
        action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Record Payment</Button>}
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
        ) : payments.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={PaymentRegular}
              title="No payments recorded"
              description="Record your first outgoing payment"
              action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Record Payment</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Payee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bank Account</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Method</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-medium">{p.reference}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(p.paymentDate))}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{p.payee}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {p.bankAccount?.bankName} <span className="font-mono">{p.bankAccount?.accountNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">{p.method.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(Number(p.amount))}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => downloadPaymentPdf(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Download payment PDF">
                        <ArrowDownloadRegular className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
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
                <Input type="date" {...register('paymentDate', { required: 'Required' })} />
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
              <Label>Payee *</Label>
              <Input placeholder="Who was paid?" {...register('payee', { required: 'Required' })} />
            </div>

            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register('amount', { required: 'Required' })} />
            </div>

            <div className="space-y-1.5">
              <Label>Link to Purchase Invoice (optional)</Label>
              <Controller control={control} name="entityType" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not linked</SelectItem>
                    <SelectItem value="PURCHASE_INVOICE">Purchase Invoice</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>

            {entityType === 'PURCHASE_INVOICE' && (
              <div className="space-y-1.5">
                <Label>Invoice</Label>
                <Controller control={control} name="invoiceId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                    <SelectContent>
                      {purchaseInvoices.map((inv) => (
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
                {isSubmitting ? 'Saving…' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
