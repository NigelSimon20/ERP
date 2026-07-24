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
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, BuildingRegular, DeleteRegular, EditRegular, PaymentRegular } from '@fluentui/react-icons';

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  accountType: string
  currency: string
  openingBalance: number
  currentBalance: number
  calculatedBalance: number
}

type FormValues = {
  bankName: string
  accountNumber: string
  accountType: string
  currency: string
  openingBalance: string
}

const ACCOUNT_TYPES = ['CURRENT', 'SAVINGS', 'FIXED_DEPOSIT', 'MONEY_MARKET', 'PETTY_CASH']
const CURRENCIES = ['USD', 'ZWL', 'ZAR', 'GBP', 'EUR']

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { bankName: '', accountNumber: '', accountType: 'CURRENT', currency: 'USD', openingBalance: '0' },
  })

  async function fetchAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/bank-accounts')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load bank accounts'); setAccounts([]); return }
      setAccounts(json.accounts ?? [])
    } catch {
      toast.error('Network error loading bank accounts')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  function openCreate() {
    setEditing(null)
    reset({ bankName: '', accountNumber: '', accountType: 'CURRENT', currency: 'USD', openingBalance: '0' })
    setShowDialog(true)
  }

  function openEdit(account: BankAccount) {
    setEditing(account)
    reset({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      currency: account.currency,
      openingBalance: String(account.openingBalance),
    })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/bank-accounts/${editing.id}` : '/api/finance/bank-accounts'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, openingBalance: Number(data.openingBalance) }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Bank account updated' : 'Bank account created')
    setShowDialog(false)
    fetchAccounts()
  }

  async function deleteAccount(account: BankAccount) {
    if (!confirm(`Delete bank account "${account.bankName} (${account.accountNumber})"? This cannot be undone.`)) return
    const res = await fetch(`/api/finance/bank-accounts/${account.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to delete bank account'); return }
    toast.success('Bank account deleted')
    fetchAccounts()
  }

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        description="Manage your company bank accounts"
        action={<Button onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Bank Account</Button>}
      />

      {loading ? (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="h-4 w-32 bg-muted rounded mb-3" />
              <div className="h-8 w-40 bg-muted rounded mb-4" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-16">
          <EmptyState icon={BuildingRegular} title="No bank accounts" description="Add your first bank account to start tracking balances" action={<Button onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-4"><AddRegular className="h-4 w-4 mr-1" /> Add Bank Account</Button>} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-brand-navy flex items-center justify-center flex-shrink-0">
                    <PaymentRegular className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{account.bankName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{account.accountNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEdit(account)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light" aria-label="Edit bank account">
                    <EditRegular className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => deleteAccount(account)} className="p-1.5 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-600" aria-label="Delete bank account">
                    <DeleteRegular className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs text-brand-muted-light mb-0.5">Current Balance</p>
                <p className={`text-2xl font-bold ${account.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(account.currentBalance)} <span className="text-sm font-normal text-brand-muted-light">{account.currency}</span>
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">{account.accountType}</span>
                {Math.abs(account.currentBalance - account.calculatedBalance) > 0.01 && (
                  <span className="text-amber-600">Variance: {formatCurrency(Math.abs(account.currentBalance - account.calculatedBalance))}</span>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <p className="text-brand-muted-light">Opening</p>
                  <p className="font-medium text-foreground">{formatCurrency(account.openingBalance)}</p>
                </div>
                <div>
                  <p className="text-brand-muted-light">Calculated</p>
                  <p className="font-medium text-foreground">{formatCurrency(account.calculatedBalance)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Bank Account' : 'New Bank Account'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bank Name *</Label>
              <Input placeholder="e.g. Standard Chartered" {...register('bankName', { required: 'Required' })} />
              {errors.bankName && <p className="text-xs text-red-500">{errors.bankName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Account Number *</Label>
              <Input placeholder="e.g. 0123456789" {...register('accountNumber', { required: 'Required' })} />
              {errors.accountNumber && <p className="text-xs text-red-500">{errors.accountNumber.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Controller control={control} name="accountType" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Controller control={control} name="currency" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <Input type="number" step="0.01" placeholder="0.00" {...register('openingBalance')} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
