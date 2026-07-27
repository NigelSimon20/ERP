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
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, PersonRegular, SignOutRegular } from '@fluentui/react-icons'

interface Visitor { id: string; visitorName: string; idNumber: string | null; companyVisited: string | null; hostName: string | null; vehicleReg: string | null; badgeNumber: string | null; checkIn: string; checkOut: string | null; siteId: string; siteName: string | null }
interface SiteOption { id: string; name: string }
type FormValues = { siteId: string; visitorName: string; idNumber: string; companyVisited: string; hostName: string; vehicleReg: string; badgeNumber: string }

const BLANK: FormValues = { siteId: '', visitorName: '', idNumber: '', companyVisited: '', hostName: '', vehicleReg: '', badgeNumber: '' }

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [sites, setSites] = useState<SiteOption[]>([])
  const [onSiteOnly, setOnSiteOnly] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({ defaultValues: BLANK })

  async function fetchVisitors() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (onSiteOnly) params.set('onSite', 'true')
      const res = await fetch(`/api/operations/visitors?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load visitors'); setVisitors([]); return }
      setVisitors(json.visitors ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchVisitors() }, [onSiteOnly])
  useEffect(() => {
    fetch('/api/operations/sites').then(r => r.json()).then(j => setSites((j.sites ?? []).map((s: any) => ({ id: s.id, name: s.name ?? s.site_name })))).catch(() => {})
  }, [])

  function openCreate() { reset(BLANK); setShowDialog(true) }

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/operations/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Visitor checked in')
    setShowDialog(false); fetchVisitors()
  }

  async function checkOut(v: Visitor) {
    const res = await fetch(`/api/operations/visitors/${v.id}/checkout`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Visitor checked out')
    fetchVisitors()
  }

  return (
    <div>
      <PageHeader title="Visitor Register" description="Log and track visitors on site" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Check In Visitor</Button>} />

      <div className="mt-4 flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onSiteOnly} onChange={(e) => setOnSiteOnly(e.target.checked)} />
          Show only visitors currently on site
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : visitors.length === 0 ? (
          <div className="py-16"><EmptyState icon={PersonRegular} title="No visitors" description={onSiteOnly ? 'No visitors currently on site' : 'No visitors logged yet'} action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Check In Visitor</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Visitor</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Host</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Check In</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Check Out</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visitors.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{v.visitorName}{v.badgeNumber ? <span className="text-xs text-brand-muted-light font-normal"> · Badge {v.badgeNumber}</span> : null}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{v.siteName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{v.hostName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{v.companyVisited ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(v.checkIn)}</td>
                    <td className="px-4 py-3 text-xs">
                      {v.checkOut ? <span className="text-muted-foreground">{formatDateTime(v.checkOut)}</span> : <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400">On Site</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!v.checkOut && (
                        <button type="button" onClick={() => checkOut(v)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground flex items-center gap-1 text-xs" aria-label="Check out">
                          <SignOutRegular className="h-3.5 w-3.5" /> Check Out
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Check In Visitor</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Controller control={control} name="siteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5"><Label>Visitor Name *</Label><Input placeholder="Full name" {...register('visitorName', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>ID / Passport Number</Label><Input {...register('idNumber')} /></div>
              <div className="space-y-1.5"><Label>Badge Number</Label><Input {...register('badgeNumber')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Company Visited</Label><Input placeholder="Visitor's employer" {...register('companyVisited')} /></div>
              <div className="space-y-1.5"><Label>Host / Person Visited</Label><Input {...register('hostName')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Vehicle Registration</Label><Input placeholder="Optional" {...register('vehicleReg')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Checking in…' : 'Check In'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
