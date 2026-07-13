'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaCheckCircle, FaTimesCircle } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Reconciliation { id: string; reconcileDate: string; statementBalance: number; bookBalance: number; difference: number; status: string; bankAccount: { bankName: string; accountNumber: string; currency: string } }
interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string; currentBalance: number }
type FormValues = { bankAccountId: string; reconcileDate: string; statementBalance: string }

export default function BankReconciliationsPage() {
  const [recs, setRecs] = useState<Reconciliation[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)

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

  return (
    <div>
      <PageHeader title="Bank Reconciliations" description="Compare your book balance with bank statements" action={<Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Start Reconciliation</Button>} />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : recs.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaCheckCircle} title="No reconciliations yet" description="Start a reconciliation to compare your bank balance with your statements" action={<Button type="button" onClick={() => setShowDialog(true)} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Start Reconciliation</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Bank Account</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Statement Balance</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Book Balance</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Difference</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[#0D1B2A]">{r.bankAccount?.bankName} <span className="text-gray-400 font-mono text-xs">{r.bankAccount?.accountNumber}</span></td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(new Date(r.reconcileDate))}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.statementBalance)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.bookBalance)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${Math.abs(r.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                    <div className="flex items-center justify-end gap-1">
                      {Math.abs(r.difference) < 0.01 ? <FaCheckCircle className="h-3.5 w-3.5" /> : <FaTimesCircle className="h-3.5 w-3.5" />}
                      {formatCurrency(r.difference)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'RECONCILED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'OPEN' && (
                      <button type="button" onClick={() => closeRec(r)} disabled={closingId === r.id || Math.abs(r.difference) > 0.01} className="text-xs text-green-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Close reconciliation">
                        {closingId === r.id ? 'Closing…' : 'Close'}
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
              <Label>Statement Balance * <span className="text-gray-400 font-normal">(from your bank statement)</span></Label>
              <Input type="number" step="0.01" placeholder="0.00" {...register('statementBalance', { required: true })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Starting…' : 'Start Reconciliation'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
