'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form'
import { FaPlus, FaTrash, FaBook, FaCheckCircle, FaTimesCircle, FaExclamationCircle } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface JournalEntry {
  id: string
  reference: string
  date: string
  description: string
  status: string
  totalDebit: number
  totalCredit: number
}

interface Account { id: string; accountCode: string; name: string; type: string }

type LineItem = { accountId: string; description: string; debit: string; credit: string }
type FormValues = { description: string; date: string; lines: LineItem[] }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  POSTED: 'bg-green-100 text-green-700',
  VOID: 'bg-red-100 text-red-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  )
}

const BLANK_LINE: LineItem = { accountId: '', description: '', debit: '', credit: '' }

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [submitMode, setSubmitMode] = useState<'draft' | 'post'>('draft')
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, control, reset } = useForm<FormValues>({
    defaultValues: {
      description: '',
      date: new Date().toISOString().split('T')[0],
      lines: [BLANK_LINE, BLANK_LINE],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchedLines = useWatch({ control, name: 'lines' }) ?? []
  const totalDebit = watchedLines.reduce((s, l) => s + (Number(l?.debit) || 0), 0)
  const totalCredit = watchedLines.reduce((s, l) => s + (Number(l?.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0

  async function fetchEntries() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      const res = await fetch(`/api/finance/journal-entries?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load journal entries'); setEntries([]); return }
      setEntries(json.entries ?? [])
    } catch {
      toast.error('Network error loading journal entries')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/finance/accounts')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load accounts'); return }
      setAccounts(json.accounts ?? [])
    } catch (err) {
      console.error(err)
      toast.error('Failed to load accounts for journal entry lines')
    }
  }

  useEffect(() => { fetchEntries() }, [statusFilter, dateFrom, dateTo])
  useEffect(() => { fetchAccounts() }, [])

  function openCreate() {
    reset({ description: '', date: new Date().toISOString().split('T')[0], lines: [BLANK_LINE, BLANK_LINE] })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    if (!isBalanced) { toast.error('Debits and credits must balance'); return }
    setSubmitting(true)
    try {
      const payload = {
        description: data.description,
        date: data.date,
        lines: data.lines.filter((l) => l.accountId).map((l) => ({
          accountId: l.accountId,
          description: l.description,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      }
      const res = await fetch('/api/finance/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }

      if (submitMode === 'post') {
        const postRes = await fetch(`/api/finance/journal-entries/${json.entry.id}?action=post`, { method: 'POST' })
        if (!postRes.ok) {
          const postJson = await postRes.json()
          toast.error(`Created but failed to post: ${postJson.error}`)
        } else {
          toast.success('Journal entry created and posted')
        }
      } else {
        toast.success('Journal entry saved as draft')
      }

      setShowDialog(false)
      fetchEntries()
    } finally {
      setSubmitting(false)
    }
  }

  async function voidEntry(entry: JournalEntry) {
    if (!confirm(`Void entry ${entry.reference}?`)) return
    const res = await fetch(`/api/finance/journal-entries/${entry.id}?action=void`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Entry voided')
    fetchEntries()
  }

  async function postEntry(entry: JournalEntry) {
    const res = await fetch(`/api/finance/journal-entries/${entry.id}?action=post`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Entry posted')
    fetchEntries()
  }

  return (
    <div>
      <PageHeader
        title="Journal Entries"
        description="Record and post general ledger entries"
        action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> New Journal Entry</Button>}
      />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="VOID">Void</option>
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-9 text-sm" aria-label="From date" />
        <span className="text-gray-400 text-sm">to</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-9 text-sm" aria-label="To date" />
        {(statusFilter || dateFrom || dateTo) && (
          <button type="button" onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo('') }} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
                <div className="h-3 flex-1 bg-gray-100 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={FaBook} title="No journal entries" description="Create your first journal entry to record transactions" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Reference</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Description</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Debit</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Credit</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-[#CC0000] font-medium">{entry.reference}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(new Date(entry.date))}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{entry.description}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#0D1B2A]">{formatCurrency(entry.totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-medium text-[#0D1B2A]">{formatCurrency(entry.totalCredit)}</td>
                  <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {entry.status === 'DRAFT' && (
                        <button type="button" onClick={() => postEntry(entry)} className="text-xs text-green-600 hover:underline font-medium" aria-label="Post entry">
                          Post
                        </button>
                      )}
                      {entry.status !== 'VOID' && (
                        <button type="button" onClick={() => voidEntry(entry)} className="text-xs text-red-500 hover:underline font-medium ml-2" aria-label="Void entry">
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Journal Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" {...register('date', { required: 'Required' })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Input placeholder="e.g. Monthly rent payment" {...register('description', { required: 'Required' })} />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="grid grid-cols-12 gap-2 mb-1 text-xs font-medium text-gray-500 px-1">
                <div className="col-span-4">Account</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-2 text-right">Debit</div>
                <div className="col-span-2 text-right">Credit</div>
                <div className="col-span-1" />
              </div>

              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Controller control={control} name={`lines.${index}.accountId`} render={({ field: f }) => (
                        <Select onValueChange={f.onChange} value={f.value}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-xs">
                                {a.accountCode} — {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    <div className="col-span-3">
                      <Input className="h-8 text-xs" placeholder="Description" {...register(`lines.${index}.description`)} />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" placeholder="0.00" {...register(`lines.${index}.debit`)} />
                    </div>
                    <div className="col-span-2">
                      <Input className="h-8 text-xs text-right" type="number" step="0.01" min="0" placeholder="0.00" {...register(`lines.${index}.credit`)} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button type="button" onClick={() => remove(index)} disabled={fields.length <= 2} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 disabled:opacity-30" aria-label="Remove line">
                        <FaTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => append(BLANK_LINE)} className="mt-2 flex items-center gap-1 text-xs text-[#CC0000] hover:underline font-medium">
                <FaPlus className="h-3 w-3" /> Add Line
              </button>
            </div>

            {/* Running totals */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 flex items-center justify-between">
              <div className="flex gap-6 text-sm">
                <span>Total Debits: <strong>{formatCurrency(totalDebit)}</strong></span>
                <span>Total Credits: <strong>{formatCurrency(totalCredit)}</strong></span>
              </div>
              {totalDebit > 0 || totalCredit > 0 ? (
                isBalanced ? (
                  <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                    <FaCheckCircle className="h-3.5 w-3.5" /> Balanced
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-500 text-xs font-medium">
                    <FaTimesCircle className="h-3.5 w-3.5" /> Debits and credits must balance
                  </span>
                )
              ) : (
                <span className="flex items-center gap-1 text-gray-400 text-xs">
                  <FaExclamationCircle className="h-3.5 w-3.5" /> Enter amounts above
                </span>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button
                type="submit"
                variant="outline"
                disabled={submitting || !isBalanced}
                onClick={() => setSubmitMode('draft')}
              >
                {submitting && submitMode === 'draft' ? 'Saving…' : 'Save as Draft'}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !isBalanced}
                onClick={() => setSubmitMode('post')}
                className="bg-[#CC0000] hover:bg-[#AA0000] text-white"
              >
                {submitting && submitMode === 'post' ? 'Posting…' : 'Save & Post'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
