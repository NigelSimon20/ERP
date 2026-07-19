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
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, GlobeRegular, ArrowSyncRegular, CaretUpFilled, CaretDownFilled } from '@fluentui/react-icons';

interface ExchangeRate {
  id: string; baseCurrency: string; targetCurrency: string; rate: number; effectiveDate: string
  createdByUser?: { name: string } | null
  previousRate?: number | null
  changePercent?: number | null
}

const RATE_POLL_INTERVAL_MS = 60_000

function MovementBadge({ changePercent }: { changePercent: number | null | undefined }) {
  if (changePercent === null || changePercent === undefined) {
    return <span className="text-[11px] text-muted-foreground">No prior rate on file</span>
  }
  if (changePercent === 0) {
    return <span className="text-[11px] text-muted-foreground">No change</span>
  }
  const up = changePercent > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <CaretUpFilled className="h-3 w-3" /> : <CaretDownFilled className="h-3 w-3" />}
      {Math.abs(changePercent).toFixed(2)}%
    </span>
  )
}
type FormValues = { baseCurrency: string; targetCurrency: string; rate: string; effectiveDate: string }

const CURRENCIES = ['USD', 'ZWG', 'ZWL', 'ZAR', 'EUR', 'GBP', 'ZMW', 'BWP']

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [currentRates, setCurrentRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { baseCurrency: 'USD', targetCurrency: 'ZWL', rate: '', effectiveDate: new Date().toISOString().split('T')[0] },
  })
  const selectedBase = watch('baseCurrency')

  async function fetchRates() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/exchange-rates')
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to load exchange rates')
        setRates([])
        setCurrentRates([])
        return
      }
      setRates(json.rates ?? [])
      setCurrentRates(json.currentRates ?? [])
    } catch {
      toast.error('Network error loading exchange rates')
      setRates([])
      setCurrentRates([])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchRates()
    // Rates only actually change once a day (RBZ cron), but polling keeps
    // this page current without a manual reload if that sync lands while
    // it's open, and keeps the movement badges fresh against edits made
    // from another session.
    const interval = setInterval(fetchRates, RATE_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  async function syncFromRbz() {
    setSyncing(true)
    try {
      const res = await fetch('/api/finance/exchange-rates?action=sync-rbz', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to sync RBZ rates'); return }
      toast.success(`Synced ${json.count} RBZ rate${json.count === 1 ? '' : 's'}`)
      fetchRates()
    } catch {
      toast.error('Network error syncing RBZ rates')
    } finally { setSyncing(false) }
  }

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/finance/exchange-rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, rate: Number(data.rate) }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Exchange rate added')
    setShowDialog(false); reset(); fetchRates()
  }

  return (
    <div>
      <PageHeader title="Exchange Rates" description="Manage currency conversion rates — synced daily from RBZ interbank rates" action={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={syncFromRbz} disabled={syncing}>
            <ArrowSyncRegular className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync from RBZ'}
          </Button>
          <Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Rate</Button>
        </div>
      } />

      {/* Current Rates Cards */}
      {currentRates.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Current Rates</h3>
          <div className="flex flex-wrap gap-3">
            {currentRates.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card px-4 py-3 min-w-[200px]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-brand-muted-light">{r.baseCurrency} → {r.targetCurrency}</p>
                  <MovementBadge changePercent={r.changePercent} />
                </div>
                <p className="text-lg font-bold text-foreground">1 {r.baseCurrency} = <span className="text-primary">{Number(r.rate).toFixed(4)}</span> {r.targetCurrency}</p>
                <p className="text-xs text-brand-muted-light mt-1">
                  As of {formatDate(new Date(r.effectiveDate))}
                  {typeof r.previousRate === 'number' && <> · was {r.previousRate.toFixed(4)}</>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/50">
          <h3 className="text-sm font-semibold text-foreground">Rate History</h3>
        </div>
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rates.length === 0 ? (
          <div className="py-16"><EmptyState icon={GlobeRegular} title="No exchange rates defined" description="Add your first rate to enable multi-currency support" action={<Button type="button" onClick={() => setShowDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Rate</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Base</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Target</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Rate</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Effective Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Added By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.map((r) => (
                <tr key={r.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-semibold text-foreground">{r.baseCurrency}</td>
                  <td className="px-4 py-3 font-semibold text-primary">{r.targetCurrency}</td>
                  <td className="px-4 py-3 text-right font-mono">{Number(r.rate).toFixed(6)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(r.effectiveDate))}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.createdByUser?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Exchange Rate</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Base Currency</Label>
                <Controller control={control} name="baseCurrency" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Target Currency</Label>
                <Controller control={control} name="targetCurrency" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.filter((c) => c !== selectedBase).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Rate *</Label><Input type="number" step="0.000001" min="0.000001" placeholder="e.g. 361.500000" {...register('rate', { required: true })} /></div>
            <div className="space-y-1.5"><Label>Effective Date *</Label><Input type="date" {...register('effectiveDate', { required: true })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Add Rate'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
