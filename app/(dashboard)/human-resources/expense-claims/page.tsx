'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, CheckmarkCircleRegular, DismissCircleRegular, MoneyRegular, ReceiptRegular } from '@fluentui/react-icons'

interface ExpenseClaim {
  id: string
  claimNumber: string
  category: string
  amount: number
  currency: string
  expenseDate: string
  description: string
  status: string
  rejectionNote: string | null
  submittedBy: { id: string; name: string }
}
interface GLAccount { id: string; account_name: string; account_code: string; account_type: string }
interface BankAccount { id: string; bankName: string; accountNumber: string }
type CreateForm = { category: string; amount: string; currency: string; expenseDate: string; description: string }
type RejectForm = { rejectionNote: string }

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  REJECTED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
}
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted text-foreground'}`}>{status}</span>
}

export default function ExpenseClaimsPage() {
  const [rows, setRows] = useState<ExpenseClaim[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<ExpenseClaim | null>(null)
  const [payTarget, setPayTarget] = useState<ExpenseClaim | null>(null)
  const [payExpenseAccountId, setPayExpenseAccountId] = useState('')
  const [payBankAccountId, setPayBankAccountId] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const expenseAccounts = useMemo(() => glAccounts.filter((a) => a.account_type === 'EXPENSE'), [glAccounts])

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<CreateForm>({ defaultValues: { category: '', amount: '', currency: 'USD', expenseDate: '', description: '' } })
  const { register: rr, handleSubmit: rSubmit, reset: rReset } = useForm<RejectForm>({ defaultValues: { rejectionNote: '' } })

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/hr/expense-claims')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load expense claims'); setRows([]); return }
      setRows(json.expenseClaims ?? [])
    } catch { toast.error('Network error loading expense claims'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => {
    fetch('/api/finance/accounts').then((r) => r.json()).then((j) => setGlAccounts(j.accounts ?? [])).catch((err) => console.error(err))
    fetch('/api/finance/bank-accounts').then((r) => r.json()).then((j) => setBankAccounts(j.accounts ?? [])).catch((err) => console.error(err))
  }, [])

  async function onCreate(data: CreateForm) {
    const res = await fetch('/api/hr/expense-claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, amount: Number(data.amount) }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Expense claim ${json.expenseClaim.claimNumber} submitted`)
    setShowCreateDialog(false)
    reset({ category: '', amount: '', currency: 'USD', expenseDate: '', description: '' })
    fetchRows()
  }

  async function approve(row: ExpenseClaim) {
    setProcessingId(row.id)
    try {
      const res = await fetch(`/api/hr/expense-claims/${row.id}?action=approve`, { method: 'PUT' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success('Expense claim approved')
      fetchRows()
    } finally { setProcessingId(null) }
  }

  function openReject(row: ExpenseClaim) { setRejectTarget(row); rReset({ rejectionNote: '' }) }
  async function onReject(data: RejectForm) {
    if (!rejectTarget) return
    const res = await fetch(`/api/hr/expense-claims/${rejectTarget.id}?action=reject`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Expense claim rejected')
    setRejectTarget(null)
    fetchRows()
  }

  function openPay(row: ExpenseClaim) {
    setPayTarget(row)
    setPayExpenseAccountId(expenseAccounts[0]?.id ?? '')
    setPayBankAccountId(bankAccounts[0]?.id ?? '')
  }
  async function confirmPay() {
    if (!payTarget) return
    if (!payExpenseAccountId || !payBankAccountId) { toast.error('Select both an expense account and a bank account'); return }
    const res = await fetch(`/api/hr/expense-claims/${payTarget.id}?action=mark-paid`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseAccountId: payExpenseAccountId, bankAccountId: payBankAccountId }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`${payTarget.claimNumber} marked paid`)
    setPayTarget(null)
    fetchRows()
  }

  return (
    <div>
      <PageHeader
        title="Expense Claims"
        description="Submit, approve, and pay out employee expense claims"
        action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Claim</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={ReceiptRegular} title="No expense claims found" description="Submit your first expense claim" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Claim #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Submitted By</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{row.claimNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.submittedBy?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.expenseDate))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(Number(row.amount), row.currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.status === 'PENDING' && (
                          <>
                            <button type="button" disabled={processingId === row.id} onClick={() => approve(row)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600 disabled:opacity-40" title="Approve" aria-label="Approve expense claim">
                              <CheckmarkCircleRegular className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => openReject(row)} className="p-1 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" title="Reject" aria-label="Reject expense claim">
                              <DismissCircleRegular className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {row.status === 'APPROVED' && (
                          <button type="button" onClick={() => openPay(row)} className="p-1 rounded hover:bg-green-50 text-brand-muted-light hover:text-green-600" title="Mark Paid" aria-label="Mark expense claim paid">
                            <MoneyRegular className="h-3.5 w-3.5" />
                          </button>
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

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Expense Claim</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Input placeholder="e.g. Fuel, Travel, Supplies" {...register('category', { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0.01" {...register('amount', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input {...register('currency')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Expense Date *</Label>
              <Input type="date" {...register('expenseDate', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea placeholder="What was this expense for?" {...register('description', { required: true })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Submitting…' : 'Submit Claim'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject Claim — {rejectTarget?.claimNumber}</DialogTitle></DialogHeader>
          <form onSubmit={rSubmit(onReject)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea placeholder="Reason for rejection…" rows={3} {...rr('rejectionNote')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button type="submit" className="bg-primary hover:bg-brand-red-dark text-white">Reject</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mark {payTarget?.claimNumber} Paid</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This posts the claim to the general ledger and marks it PAID. Choose the expense account to debit and the bank account it was paid from.</p>
            <div className="space-y-1.5">
              <Label>Expense Account *</Label>
              <Select onValueChange={setPayExpenseAccountId} value={payExpenseAccountId}>
                <SelectTrigger><SelectValue placeholder="Select expense account" /></SelectTrigger>
                <SelectContent>{expenseAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.account_code} — {a.account_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bank Account *</Label>
              <Select onValueChange={setPayBankAccountId} value={payBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>{bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} — {b.accountNumber}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
              <Button type="button" onClick={confirmPay} className="bg-primary hover:bg-brand-red-dark text-white">Mark Paid</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
