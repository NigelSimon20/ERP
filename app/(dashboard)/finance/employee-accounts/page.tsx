'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaCreditCard, FaPen, FaTrash } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import toast from 'react-hot-toast'

interface EmployeeAccount { id: string; bankName: string; accountNumber: string; accountType: string; isPrimary: boolean; active: boolean; guard: { name: string; employeeNumber: string } }
interface Guard { id: string; name: string; employeeNumber: string }
type FormValues = { guardId: string; bankName: string; accountNumber: string; accountType: string; branchCode: string; isPrimary: string }

const ACCOUNT_TYPES = ['Savings', 'Current', 'Cheque']

export default function EmployeeAccountsPage() {
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<EmployeeAccount | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { guardId: '', bankName: '', accountNumber: '', accountType: 'Savings', branchCode: '', isPrimary: 'true' },
  })

  async function fetchAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/employee-accounts')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load employee accounts'); setAccounts([]); return }
      setAccounts(json.accounts ?? [])
    } catch {
      toast.error('Network error loading employee accounts')
      setAccounts([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchAccounts() }, [])
  useEffect(() => {
    fetch('/api/guards').then(r => r.json()).then(j => setGuards(j.guards ?? [])).catch((err) => console.error(err))
  }, [])

  function openCreate() { setEditing(null); reset({ guardId: '', bankName: '', accountNumber: '', accountType: 'Savings', branchCode: '', isPrimary: 'true' }); setShowDialog(true) }
  function openEdit(a: EmployeeAccount) {
    setEditing(a)
    reset({ guardId: '', bankName: a.bankName, accountNumber: a.accountNumber, accountType: a.accountType, branchCode: '', isPrimary: String(a.isPrimary) })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/finance/employee-accounts/${editing.id}` : '/api/finance/employee-accounts'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, isPrimary: data.isPrimary === 'true' }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Account updated' : 'Account added')
    setShowDialog(false); fetchAccounts()
  }

  async function deleteAccount(a: EmployeeAccount) {
    if (!confirm(`Remove bank account ${a.accountNumber}?`)) return
    const res = await fetch(`/api/finance/employee-accounts/${a.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete'); return }
    toast.success('Account removed'); fetchAccounts()
  }

  return (
    <div>
      <PageHeader title="Employee Accounts" description="Manage guard bank accounts for payroll disbursement" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Add Account</Button>} />

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-32 bg-gray-200 rounded" /><div className="h-3 flex-1 bg-gray-100 rounded" /></div>)}</div>
        ) : accounts.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaCreditCard} title="No employee bank accounts" description="Add bank accounts to enable payroll disbursement" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Add Account</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Guard</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Bank</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Account Number</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Primary</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0D1B2A]">{a.guard?.name}</p>
                    <p className="text-xs text-gray-400">{a.guard?.employeeNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{a.bankName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.accountNumber}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.accountType}</td>
                  <td className="px-4 py-3">
                    {a.isPrimary && <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-700 font-medium">Primary</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${a.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{a.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" aria-label="Edit account"><FaPen className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => deleteAccount(a)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Delete account"><FaTrash className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Bank Account' : 'Add Employee Bank Account'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {!editing && (
              <div className="space-y-1.5">
                <Label>Guard *</Label>
                <Controller control={control} name="guardId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                    <SelectContent>{guards.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.employeeNumber})</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            )}
            <div className="space-y-1.5"><Label>Bank Name *</Label><Input placeholder="e.g. FBC Bank" {...register('bankName', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Account Number *</Label><Input placeholder="Account number" {...register('accountNumber', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Controller control={control} name="accountType" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Branch Code</Label><Input placeholder="Optional" {...register('branchCode')} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Set as Primary?</Label>
              <Controller control={control} name="isPrimary" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="true">Yes — make primary</SelectItem><SelectItem value="false">No — secondary</SelectItem></SelectContent>
                </Select>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Account'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
