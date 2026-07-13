'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaGlobe } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface ExchangeRate { id: string; baseCurrency: string; targetCurrency: string; rate: number; effectiveDate: string; createdByUser?: { name: string } | null }
type FormValues = { baseCurrency: string; targetCurrency: string; rate: string; effectiveDate: string }

const CURRENCIES = ['USD', 'ZWL', 'ZAR', 'EUR', 'GBP', 'ZMW', 'BWP']

export default function ExchangeRatesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [currentRates, setCurrentRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

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

  useEffect(() => { fetchRates() }, [])

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
      <PageHeader title="Exchange Rates" description="Manage currency conversion rates" action={<Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Add Rate</Button>} />

      {/* Current Rates Cards */}
      {currentRates.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Current Rates</h3>
          <div className="flex flex-wrap gap-3">
            {currentRates.map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3 min-w-[200px]">
                <p className="text-xs text-gray-400 mb-1">{r.baseCurrency} → {r.targetCurrency}</p>
                <p className="text-lg font-bold text-[#0D1B2A]">1 {r.baseCurrency} = <span className="text-[#CC0000]">{Number(r.rate).toFixed(4)}</span> {r.targetCurrency}</p>
                <p className="text-xs text-gray-400 mt-1">As of {formatDate(new Date(r.effectiveDate))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-[#0D1B2A]">Rate History</h3>
        </div>
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : rates.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaGlobe} title="No exchange rates defined" description="Add your first rate to enable multi-currency support" action={<Button type="button" onClick={() => setShowDialog(true)} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Add Rate</Button>} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Base</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Target</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Rate</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Effective Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Added By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rates.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-[#0D1B2A]">{r.baseCurrency}</td>
                  <td className="px-4 py-3 font-semibold text-[#CC0000]">{r.targetCurrency}</td>
                  <td className="px-4 py-3 text-right font-mono">{Number(r.rate).toFixed(6)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(new Date(r.effectiveDate))}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.createdByUser?.name ?? '—'}</td>
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
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Saving…' : 'Add Rate'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
