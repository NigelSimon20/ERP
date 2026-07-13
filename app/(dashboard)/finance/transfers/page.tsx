'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaExchangeAlt } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Transfer {
  id: string
  reference: string
  transferDate: string
  amount: number
  notes: string | null
  fromAccount: { bankName: string; accountNumber: string }
  toAccount: { bankName: string; accountNumber: string }
}

interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string; currentBalance: number }

type FormValues = { fromAccountId: string; toAccountId: string; amount: string; transferDate: string; notes: string }

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { fromAccountId: '', toAccountId: '', amount: '', transferDate: new Date().toISOString().split('T')[0], notes: '' },
  })

  const fromId = watch('fromAccountId')
  const toId = watch('toAccountId')
  const amount = watch('amount')
  const fromAccount = bankAccounts.find((b) => b.id === fromId)
  const toAccount = bankAccounts.find((b) => b.id === toId)
  const amtNum = Number(amount) || 0
  const showPreview = fromAccount && toAccount && amtNum > 0 && fromId !== toId

  async function fetchTransfers() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/transfers')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load transfers'); setTransfers([]); return }
      setTransfers(json.transfers ?? [])
    } catch {
      toast.error('Network error loading transfers')
      setTransfers([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchTransfers() }, [])
  useEffect(() => {
    fetch('/api/finance/bank-accounts').then((r) => r.json()).then((j) => setBankAccounts(j.accounts ?? [])).catch((err) => console.error(err))
  }, [])

  async function onSubmit(data: FormValues) {
    if (data.fromAccountId === data.toAccountId) { toast.error('Cannot transfer to same account'); return }
    const res = await fetch('/api/finance/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccountId: data.fromAccountId, toAccountId: data.toAccountId, amount: Number(data.amount), transferDate: data.transferDate, notes: data.notes || undefined }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Transfer ${json.transfer?.reference ?? ''} completed`)
    setShowDialog(false)
    reset()
    fetchTransfers()
  }

  return (
    <div>
      <PageHeader title="Bank Transfers" description="Move funds between your bank accounts" action={<Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> New Transfer</Button>} />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-24 bg-gray-200 rounded" /><div className="h-3 flex-1 bg-gray-100 rounded" /><div className="h-3 w-20 bg-gray-200 rounded" /></div>)}</div>
        ) : transfers.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaExchangeAlt} title="No transfers recorded yet" description="Create a transfer to move funds between bank accounts" action={<Button type="button" onClick={() => setShowDialog(true)} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> New Transfer</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Reference</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">From</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">To</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-[#CC0000] font-medium">{t.reference}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(new Date(t.transferDate))}</td>
                  <td className="px-4 py-3 text-gray-700">{t.fromAccount?.bankName}</td>
                  <td className="px-4 py-3 text-gray-700">{t.toAccount?.bankName}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(t.amount))}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{t.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Bank Transfer</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>From Account *</Label>
              <Controller control={control} name="fromAccountId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select source account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.filter((b) => b.id !== toId).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.bankName} — {b.accountNumber} ({formatCurrency(Number(b.currentBalance))})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>To Account *</Label>
              <Controller control={control} name="toAccountId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.filter((b) => b.id !== fromId).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.bankName} — {b.accountNumber} ({formatCurrency(Number(b.currentBalance))})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register('amount', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" {...register('transferDate', { required: true })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" {...register('notes')} />
            </div>

            {showPreview && (
              <div className="rounded-lg border border-[#0D1B2A]/20 bg-[#0D1B2A]/5 p-3 text-sm space-y-1">
                <p className="font-medium text-[#0D1B2A]">Transfer Preview</p>
                <p className="text-gray-600 text-xs">Moving {formatCurrency(amtNum)} from {fromAccount!.bankName} → {toAccount!.bankName}</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  <div className="rounded bg-white border p-2">
                    <p className="text-gray-400">{fromAccount!.bankName} after</p>
                    <p className={`font-bold ${Number(fromAccount!.currentBalance) - amtNum >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(Number(fromAccount!.currentBalance) - amtNum)}</p>
                  </div>
                  <div className="rounded bg-white border p-2">
                    <p className="text-gray-400">{toAccount!.bankName} after</p>
                    <p className="font-bold text-green-600">{formatCurrency(Number(toAccount!.currentBalance) + amtNum)}</p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">
                {isSubmitting ? 'Processing…' : 'Confirm Transfer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
