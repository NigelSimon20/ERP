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
import { AddRegular, BookRegular, ChevronRightRegular, DeleteRegular, EditRegular, PowerRegular } from '@fluentui/react-icons';

interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: string
  current_balance: number | null
  currency: string | null
  is_active: boolean | null
  parent_account_id: string | null
}

type FormValues = {
  accountCode: string
  name: string
  type: string
  parentId: string
  active: boolean
}

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const
const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expenses',
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { accountCode: '', name: '', type: 'ASSET', parentId: '', active: true },
  })

  async function fetchAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/accounts')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load accounts'); setAccounts([]); return }
      setAccounts(json.accounts ?? [])
    } catch {
      toast.error('Network error loading accounts')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAccounts() }, [])

  function openCreate() {
    setEditing(null)
    reset({ accountCode: '', name: '', type: 'ASSET', parentId: '', active: true })
    setShowDialog(true)
  }

  function openEdit(account: Account) {
    setEditing(account)
    reset({
      accountCode: account.account_code,
      name: account.account_name,
      type: account.account_type,
      parentId: account.parent_account_id ?? '',
      active: account.is_active ?? true,
    })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/accounts/${editing.id}` : '/api/finance/accounts'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, parentId: data.parentId || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Account updated' : 'Account created')
    setShowDialog(false)
    fetchAccounts()
  }

  async function toggleActive(account: Account) {
    const res = await fetch(`/api/finance/accounts/${account.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !account.is_active }),
    })
    if (!res.ok) { toast.error('Failed to update'); return }
    toast.success(account.is_active ? 'Account deactivated' : 'Account activated')
    fetchAccounts()
  }

  async function deleteAccount(account: Account) {
    if (!confirm(`Delete account ${account.account_code} — ${account.account_name}?`)) return
    const res = await fetch(`/api/finance/accounts/${account.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Account deleted')
    fetchAccounts()
  }

  const grouped = ACCOUNT_TYPES.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    rows: accounts.filter((a) => a.account_type === type),
  })).filter((g) => g.rows.length > 0)

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        description="Manage your general ledger accounts"
        action={<Button onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Account</Button>}
      />

      {loading ? (
        <div className="space-y-6 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-5 w-32 bg-muted rounded mb-3" />
              <div className="rounded-lg border border-border bg-card divide-y divide-border">
                {[1, 2, 3].map((j) => <div key={j} className="h-12 bg-muted/50" />)}
              </div>
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-16">
          <EmptyState icon={BookRegular} title="No accounts yet" description="Add your first account to start your chart of accounts" action={<Button onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-4"><AddRegular className="h-4 w-4 mr-1" /> Add Account</Button>} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map(({ type, label, rows }) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <ChevronRightRegular className="h-4 w-4 text-brand-muted-light" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{label}</h3>
                <span className="text-xs text-brand-muted-light">({rows.length})</span>
              </div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Code</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Type</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-36">Balance</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Status</th>
                      <th className="px-4 py-2.5 w-24 text-left font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((account) => (
                      <tr key={account.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{account.account_code}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{account.account_name}</td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{account.account_type.toLowerCase()}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {formatCurrency(Number(account.current_balance ?? 0), account.currency)}
                        </td>
                        <td className="px-4 py-3"><StatusBadge active={!!account.is_active} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button type="button" onClick={() => openEdit(account)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" title="Edit" aria-label="Edit account">
                              <EditRegular className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => toggleActive(account)} className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" title={account.is_active ? 'Deactivate' : 'Activate'} aria-label={account.is_active ? 'Deactivate account' : 'Activate account'}>
                              <PowerRegular className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => deleteAccount(account)} className="p-1.5 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Delete" aria-label="Delete account">
                              <DeleteRegular className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Account' : 'New Account'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account Code *</Label>
                <Input placeholder="e.g. 1000" {...register('accountCode', { required: 'Required' })} disabled={!!editing} />
                {errors.accountCode && <p className="text-xs text-red-500">{errors.accountCode.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account Name *</Label>
              <Input placeholder="e.g. Cash and Bank" {...register('name', { required: 'Required' })} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Parent Account (optional)</Label>
              <Controller control={control} name="parentId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {accounts.filter((a) => a.id !== editing?.id).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
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
