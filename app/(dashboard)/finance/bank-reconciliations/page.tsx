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
import { AddRegular, ArrowDownloadRegular, CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';

interface Reconciliation { id: string; reconcileDate: string; statementBalance: number; bookBalance: number; difference: number; status: string; bankAccountId: string; bankAccount: { bankName: string; accountNumber: string; currency: string } }
interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string; currentBalance: number }
interface GLAccount { id: string; account_name: string; account_type: string }
type FormValues = { bankAccountId: string; reconcileDate: string; statementBalance: string }

export default function BankReconciliationsPage() {
  const [recs, setRecs] = useState<Reconciliation[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [adjustingRec, setAdjustingRec] = useState<Reconciliation | null>(null)
  const [offsetAccountId, setOffsetAccountId] = useState('')
  const [posting, setPosting] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { bankAccountId: '', reconcileDate: new Date().toISOString().split('T')[0], statementBalance: '' },
  })

  async function fetchRecs() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/bank-reconciliations')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load reconciliations'); setRecs([]); return }
      setRecs(json.reconciliations ?? [])
    } catch {
      toast.error('Network error loading reconciliations')
      setRecs([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchRecs() }, [])
  useEffect(() => {
    fetch('/api/finance/bank-accounts').then(r => r.json()).then(j => setBankAccounts(j.accounts ?? [])).catch((err) => {
      console.error(err)
      toast.error('Failed to load bank accounts')
    })
  }, [])
  useEffect(() => {
    fetch('/api/finance/accounts').then(r => r.json()).then(j => setGlAccounts(j.accounts ?? [])).catch((err) => {
      console.error(err)
      toast.error('Failed to load chart of accounts')
    })
  }, [])

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/finance/bank-reconciliations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, statementBalance: Number(data.statementBalance) }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Reconciliation started')
    setShowDialog(false); reset(); fetchRecs()
  }

  async function closeRec(rec: Reconciliation) {
    if (Math.abs(rec.difference) > 0.01) { toast.error(`Cannot close: difference of ${formatCurrency(Math.abs(rec.difference))} remains`); return }
    if (!confirm('Close this reconciliation?')) return
    setClosingId(rec.id)
    try {
      const res = await fetch('/api/finance/bank-reconciliations?action=close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rec.id }) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Reconciliation closed'); fetchRecs()
    } finally { setClosingId(null) }
  }

  async function exportPdf() {
    try {
      const { exportReportPdf } = await import('@/lib/pdf')
      const settingsRes = await fetch('/api/settings')
      const company = settingsRes.ok ? (await settingsRes.json()).company ?? {} : {}
      await exportReportPdf('bank-reconciliation', {
        rows: recs.map((r) => ({
          bankName: r.bankAccount?.bankName, accountNumber: r.bankAccount?.accountNumber,
          reconcileDate: r.reconcileDate, statementBalance: r.statementBalance, bookBalance: r.bookBalance,
          difference: r.difference, status: r.status,
        })),
      }, company, {})
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  function openAdjustDialog(rec: Reconciliation) {
    const suspense = glAccounts.find(a => a.account_type === 'SUSPENSE')
    setOffsetAccountId(suspense?.id ?? '')
    setAdjustingRec(rec)
  }

  async function postAdjustment() {
    if (!adjustingRec || !offsetAccountId) return
    setPosting(true)
    try {
      const res = await fetch('/api/finance/bank-reconciliations?action=adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: adjustingRec.id, offsetAccountId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success(json.adjustment ? `Adjustment posted (${json.adjustment.paymentNumber})` : 'Reconciliation closed')
      setAdjustingRec(null); fetchRecs()
    } finally { setPosting(false) }
  }

  return (
    <div>
      <PageHeader title="Bank Reconciliations" description="Compare your book balance with bank statements" action={
        <div className="flex gap-2">
          {recs.length > 0 && <Button type="button" variant="outline" onClick={exportPdf} className="gap-1.5"><ArrowDownloadRegular className="h-3.5 w-3.5" /> Export PDF</Button>}
          <Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Start Reconciliation</Button>
        </div>
      } />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : recs.length === 0 ? (
          <div className="py-16"><EmptyState icon={CheckmarkCircleRegular} title="No reconciliations yet" description="Start a reconciliation to compare your bank balance with your statements" action={<Button type="button" onClick={() => setShowDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Start Reconciliation</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Bank Account</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Statement Balance</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Book Balance</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Difference</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recs.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{r.bankAccount?.bankName} <span className="text-brand-muted-light font-mono text-xs">{r.bankAccount?.accountNumber}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(r.reconcileDate))}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.statementBalance)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.bookBalance)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${Math.abs(r.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    <div className="flex items-center justify-end gap-1">
                      {Math.abs(r.difference) < 0.01 ? <CheckmarkCircleRegular className="h-3.5 w-3.5" /> : <DismissCircleRegular className="h-3.5 w-3.5" />}
                      {formatCurrency(r.difference)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'RECONCILED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'OPEN' && Math.abs(r.difference) <= 0.01 && (
                      <button type="button" onClick={() => closeRec(r)} disabled={closingId === r.id} className="text-xs text-green-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Close reconciliation">
                        {closingId === r.id ? 'Closing…' : 'Close'}
                      </button>
                    )}
                    {r.status === 'OPEN' && Math.abs(r.difference) > 0.01 && (
                      <button type="button" onClick={() => openAdjustDialog(r)} className="text-xs text-amber-600 hover:underline" aria-label="Post reconciliation adjustment">
                        Adjust…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start Bank Reconciliation</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bank Account *</Label>
              <Controller control={control} name="bankAccountId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.bankName} — {b.accountNumber} (Book: {formatCurrency(Number(b.currentBalance))})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5"><Label>Reconciliation Date *</Label><Input type="date" {...register('reconcileDate', { required: true })} /></div>
            <div className="space-y-1.5">
              <Label>Statement Balance * <span className="text-brand-muted-light font-normal">(from your bank statement)</span></Label>
              <Input type="number" step="0.01" placeholder="0.00" {...register('statementBalance', { required: true })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Starting…' : 'Start Reconciliation'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustingRec} onOpenChange={(open) => { if (!open) setAdjustingRec(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Post Reconciliation Adjustment</DialogTitle></DialogHeader>
          {adjustingRec && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {adjustingRec.bankAccount?.bankName} — books currently show <strong>{formatCurrency(adjustingRec.bookBalance)}</strong>,
                the statement says <strong>{formatCurrency(adjustingRec.statementBalance)}</strong>. Posting will create a one-time
                {' '}{adjustingRec.difference > 0 ? 'inflow' : 'outflow'} of <strong>{formatCurrency(Math.abs(adjustingRec.difference))}</strong> against
                the bank account and the chart-of-account you choose below, then close this reconciliation.
              </p>
              <div className="space-y-1.5">
                <Label>Offset Account *</Label>
                <Select onValueChange={setOffsetAccountId} value={offsetAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {glAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.account_name} ({a.account_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-brand-muted-light">Defaults to Suspense if one exists. Change it if you know exactly what the difference is (e.g. Bank Charges, Interest Income).</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAdjustingRec(null)}>Cancel</Button>
                <Button type="button" onClick={postAdjustment} disabled={posting || !offsetAccountId} className="bg-primary hover:bg-brand-red-dark text-white">{posting ? 'Posting…' : 'Post Adjustment'}</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
