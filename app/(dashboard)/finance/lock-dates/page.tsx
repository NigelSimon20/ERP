'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DeleteRegular, LockClosedRegular, WarningRegular } from '@fluentui/react-icons';

interface LockDate { id: string; lockedUntil: string; reason: string | null; createdAt: string; createdByUser?: { name: string } | null }
type FormValues = { lockedUntil: string; reason: string }

export default function LockDatesPage() {
  const [locks, setLocks] = useState<LockDate[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { lockedUntil: '', reason: '' },
  })

  async function fetchLocks() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/lock-dates')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load lock dates'); setLocks([]); return }
      setLocks(json.locks ?? [])
    } catch {
      toast.error('Network error loading lock dates')
      setLocks([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchLocks() }, [])

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/finance/lock-dates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lockedUntil: data.lockedUntil, reason: data.reason || undefined }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(`Period locked until ${formatDate(new Date(data.lockedUntil))}`)
    setShowDialog(false); reset(); fetchLocks()
  }

  async function deleteLock(lock: LockDate) {
    if (!confirm('Remove this lock date? This will allow backdated entries into this period.')) return
    const res = await fetch(`/api/finance/lock-dates?id=${lock.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed — only Super Admins can remove lock dates'); return }
    toast.success('Lock date removed'); fetchLocks()
  }

  const activeLocks = locks.filter(l => new Date(l.lockedUntil) >= new Date())
  const expiredLocks = locks.filter(l => new Date(l.lockedUntil) < new Date())

  return (
    <div>
      <PageHeader title="Lock Dates" description="Prevent backdated entries into closed accounting periods" action={<Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Lock Date</Button>} />

      {activeLocks.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <WarningRegular className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Active Period Locks</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {activeLocks.length} active lock{activeLocks.length > 1 ? 's' : ''} — transactions cannot be backdated into locked periods.
              {' '}Current lock: <strong>until {formatDate(new Date(activeLocks[0].lockedUntil))}</strong>
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/50">
          <h3 className="text-sm font-semibold text-foreground">Active Locks</h3>
        </div>
        {loading ? (
          <div className="divide-y divide-border">{[1, 2].map((i) => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-24 bg-muted rounded" /><div className="h-3 flex-1 bg-muted rounded" /></div>)}</div>
        ) : activeLocks.length === 0 ? (
          <div className="py-10"><EmptyState icon={LockClosedRegular} title="No active lock dates" description="All periods are open for entry" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Locked Until</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">By</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeLocks.map((l) => (
                <tr key={l.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-semibold text-primary">{formatDate(new Date(l.lockedUntil))}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(l.createdAt))}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{l.createdByUser?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => deleteLock(l)} className="p-1.5 rounded hover:bg-red-50 text-brand-muted-light hover:text-red-500" aria-label="Remove lock"><DeleteRegular className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {expiredLocks.length > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <h3 className="text-sm font-semibold text-brand-muted-light">Expired Locks</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {expiredLocks.map((l) => (
                <tr key={l.id} className="opacity-50">
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(new Date(l.lockedUntil))}</td>
                  <td className="px-4 py-2.5 text-brand-muted-light text-xs">{l.reason ?? '—'}</td>
                  <td className="px-4 py-2.5 text-brand-muted-light text-xs">{l.createdByUser?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Lock Date</DialogTitle></DialogHeader>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 mb-2">
            Transactions will be blocked from being posted to dates on or before the locked date. Only Finance Managers and Super Admins can create locks.
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Lock Until Date *</Label>
              <Input type="date" {...register('lockedUntil', { required: true })} />
              <p className="text-xs text-brand-muted-light">No new entries can be posted on or before this date</p>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea placeholder="e.g. Month-end close — January 2026" rows={2} {...register('reason')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Add Lock Date'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
