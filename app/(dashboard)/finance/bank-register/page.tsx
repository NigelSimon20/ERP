'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { BookRegular } from '@fluentui/react-icons';

interface BankAccount { id: string; bankName: string; accountNumber: string; currency: string }
interface RegisterRow { date: string; type: string; reference: string; description: string; amount: number; runningBalance: number }
interface RegisterData {
  bankAccount: { id: string; bankName: string; accountNumber: string; currency: string; currentBalance: number }
  rows: RegisterRow[]
  openingBalanceAtFrom: number
  closingBalance: number
}

const TYPE_STYLES: Record<string, string> = {
  Receipt: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  'Transfer In': 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  Payment: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  'Transfer Out': 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
}

export default function BankRegisterPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState<RegisterData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/finance/bank-accounts').then(r => r.json()).then(json => {
      const accounts = json.accounts ?? []
      setBankAccounts(accounts)
      if (accounts.length && !bankAccountId) setBankAccountId(accounts[0].id)
    }).catch((err) => console.error(err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadRegister = useCallback(async () => {
    if (!bankAccountId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/bank-accounts/${bankAccountId}/register?from=${from}&to=${to}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load register'); setData(null); return }
      setData(json)
    } catch {
      toast.error('Network error loading register')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [bankAccountId, from, to])

  useEffect(() => { loadRegister() }, [loadRegister])

  return (
    <div>
      <PageHeader title="Bank Register" description="Chronological transaction history and running balance per bank account" />

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Bank Account</Label>
            <Select onValueChange={setBankAccountId} value={bankAccountId}>
              <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} — {a.accountNumber} ({a.currency})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {data && !loading && (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="erp-card !p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Opening Balance</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(data.openingBalanceAtFrom)}</p>
          </div>
          <div className="erp-card !p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Closing Balance</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(data.closingBalance)}</p>
          </div>
          <div className="erp-card !p-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Current Balance</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(data.bankAccount.currentBalance)}</p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : !data || data.rows.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={BookRegular} title="No transactions in this range" description="Try widening the date range or selecting a different account" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(r.date))}</td>
                    <td className="px-4 py-3"><span className={`text-xs rounded-full px-2 py-0.5 ${TYPE_STYLES[r.type] ?? 'bg-muted text-muted-foreground'}`}>{r.type}</span></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.reference}</td>
                    <td className="px-4 py-3 text-foreground">{r.description}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.amount >= 0 ? '+' : ''}{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
