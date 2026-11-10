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
import { formatDate, formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { fetchList } from '@/lib/fetch-list'
import { AddRegular, PeopleRegular } from '@fluentui/react-icons';

interface Deployment { id: string; shift: string; startDate: string; endDate: string | null; hoursPerDay: number; ratePerHour: number; status: string; guard: { id: string; name: string; employeeNumber: string }; site: { id: string; name: string } }
interface Guard { id: string; name: string; employeeNumber: string }
interface Site { id: string; name: string }
type FormValues = { guardId: string; siteId: string; shift: string; startDate: string; endDate: string; hoursPerDay: string; ratePerHour: string }

const STATUS_STYLES: Record<string, string> = { ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', COMPLETED: 'bg-muted text-muted-foreground', CANCELLED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }
const SHIFTS = ['DAY', 'NIGHT', 'FULLDAY', 'ROTATING']

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [guards, setGuards] = useState<Guard[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [filterSite, setFilterSite] = useState('')
  const [filterGuard, setFilterGuard] = useState('')
  const [filterStatus, setFilterStatus] = useState('ACTIVE')
  const [formError, setFormError] = useState('')

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { guardId: '', siteId: '', shift: 'DAY', startDate: '', endDate: '', hoursPerDay: '8', ratePerHour: '' },
  })

  async function fetchDeployments() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterSite) params.set('siteId', filterSite)
    if (filterGuard) params.set('guardId', filterGuard)
    if (filterStatus) params.set('status', filterStatus)
    try {
      const res = await fetch(`/api/operations/deployments?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load deployments'); setDeployments([]); return }
      setDeployments(json.deployments ?? [])
    } catch {
      toast.error('Network error loading deployments')
      setDeployments([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchDeployments() }, [filterSite, filterGuard, filterStatus])
  // Loaded independently so one failing endpoint can't blank both dropdowns
  // (a 404 on guards used to reject the Promise.all and drop the sites too).
  useEffect(() => {
    fetchList<Guard>('/api/guards', 'guards', 'guards').then(setGuards)
    fetchList<Site>('/api/operations/sites', 'sites', 'sites').then(setSites)
  }, [])

  async function onSubmit(data: FormValues) {
    setFormError('')
    const res = await fetch('/api/operations/deployments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, hoursPerDay: Number(data.hoursPerDay), ratePerHour: Number(data.ratePerHour), endDate: data.endDate || null }),
    })
    const json = await res.json()
    if (!res.ok) { setFormError(json.error); return }
    toast.success('Deployment created')
    setShowDialog(false); reset(); fetchDeployments()
  }

  async function changeStatus(dep: Deployment, status: string) {
    const res = await fetch(`/api/operations/deployments/${dep.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(status === 'COMPLETED' ? { endDate: new Date().toISOString().split('T')[0] } : {}) }),
    })
    if (!res.ok) { toast.error('Failed to update'); return }
    toast.success(`Deployment ${status.toLowerCase()}`)
    fetchDeployments()
  }

  return (
    <div>
      <PageHeader title="Deployments" description="Manage guard assignments to sites" action={<Button type="button" onClick={() => { reset(); setFormError(''); setShowDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New Deployment</Button>} />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All sites" /></SelectTrigger>
          <SelectContent><SelectItem value="">All sites</SelectItem>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterGuard} onValueChange={setFilterGuard}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All guards" /></SelectTrigger>
          <SelectContent><SelectItem value="">All guards</SelectItem>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : deployments.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No deployments found" description="Create a deployment to assign a guard to a site" action={<Button type="button" onClick={() => setShowDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> New Deployment</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Guard</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Shift</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Start</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">End</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Hrs/Day</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Rate/Hr</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {deployments.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{d.guard?.name}</p>
                      <p className="text-xs text-brand-muted-light">{d.guard?.employeeNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">{d.site?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{d.shift}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(d.startDate))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.endDate ? formatDate(new Date(d.endDate)) : <span className="text-brand-muted-light">Ongoing</span>}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{d.hoursPerDay}</td>
                    <td className="px-4 py-3 text-right">{d.ratePerHour > 0 ? formatCurrency(Number(d.ratePerHour)) : '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status] ?? 'bg-muted text-muted-foreground'}`}>{d.status}</span></td>
                    <td className="px-4 py-3">
                      {d.status === 'ACTIVE' && (
                        <div className="flex items-center gap-2 text-xs">
                          <button type="button" onClick={() => changeStatus(d, 'COMPLETED')} className="text-green-600 dark:text-green-400 hover:underline" aria-label="Complete deployment">Complete</button>
                          <button type="button" onClick={() => changeStatus(d, 'CANCELLED')} className="text-primary hover:underline" aria-label="Cancel deployment">Cancel</button>
                        </div>
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
          <DialogHeader><DialogTitle>New Deployment</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Guard *</Label>
              <Controller control={control} name="guardId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                  <SelectContent>{guards.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.employeeNumber})</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Controller control={control} name="siteId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Shift</Label>
                <Controller control={control} name="shift" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SHIFTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Hours/Day</Label><Input type="number" min="1" max="24" {...register('hoursPerDay')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start Date *</Label><Input type="date" {...register('startDate', { required: true })} /></div>
              <div className="space-y-1.5"><Label>End Date <span className="text-brand-muted-light">(optional)</span></Label><Input type="date" {...register('endDate')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Rate/Hour</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('ratePerHour')} /></div>
            {formError && <p className="text-sm text-primary bg-primary/5 border border-primary/20 rounded p-2">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Create Deployment'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
