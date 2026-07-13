'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaMapMarkerAlt, FaChevronDown, FaChevronRight, FaPen, FaTrash } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Site {
  id: string; name: string; address: string | null; guardsRequired: number
  contractValue: number | null; contractStart: string | null; contractEnd: string | null
  status: string; activeDeploymentCount: number; customerName: string | null; customerId: string | null
  deployments?: { id: string; guard: { name: string; employeeNumber: string }; shift: string; startDate: string }[]
}
interface Customer { id: string; name: string }
type FormValues = { name: string; customerId: string; address: string; guardsRequired: string; contractValue: string; contractStart: string; contractEnd: string; status: string }

const CONTRACT_EXPIRY_WARN_DAYS = 30

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false
  const diff = new Date(dateStr).getTime() - Date.now()
  return diff > 0 && diff <= CONTRACT_EXPIRY_WARN_DAYS * 86400_000
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDeployments, setExpandedDeployments] = useState<Site['deployments']>([])

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', customerId: '', address: '', guardsRequired: '1', contractValue: '', contractStart: '', contractEnd: '', status: 'ACTIVE' },
  })

  async function fetchSites() {
    setLoading(true)
    try {
      const res = await fetch('/api/operations/sites')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load sites'); setSites([]); return }
      setSites(json.sites ?? [])
    } catch {
      toast.error('Network error loading sites')
      setSites([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchSites() }, [])
  useEffect(() => {
    fetch('/api/finance/customers')
      .then(r => r.json())
      .then(j => setCustomers(j.customers ?? []))
      .catch((err) => console.error(err))
  }, [])

  function openCreate() { setEditing(null); reset({ name: '', customerId: '', address: '', guardsRequired: '1', contractValue: '', contractStart: '', contractEnd: '', status: 'ACTIVE' }); setShowDialog(true) }
  function openEdit(s: Site) {
    setEditing(s)
    reset({ name: s.name, customerId: s.customerId ?? '', address: s.address ?? '', guardsRequired: String(s.guardsRequired), contractValue: s.contractValue != null ? String(Number(s.contractValue)) : '', contractStart: s.contractStart?.split('T')[0] ?? '', contractEnd: s.contractEnd?.split('T')[0] ?? '', status: s.status })
    setShowDialog(true)
  }

  async function toggleExpand(site: Site) {
    if (expandedId === site.id) { setExpandedId(null); return }
    setExpandedId(site.id)
    try {
      const res = await fetch(`/api/operations/sites/${site.id}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load site deployments'); setExpandedDeployments([]); return }
      setExpandedDeployments(json.site?.deployments ?? [])
    } catch {
      toast.error('Network error loading site deployments')
      setExpandedDeployments([])
    }
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/operations/sites/${editing.id}` : '/api/operations/sites'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, guardsRequired: Number(data.guardsRequired), contractValue: data.contractValue ? Number(data.contractValue) : null, customerId: data.customerId || null, contractStart: data.contractStart || null, contractEnd: data.contractEnd || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Site updated' : 'Site created')
    setShowDialog(false); fetchSites()
  }

  async function deleteSite(s: Site) {
    if (!confirm(`Delete site "${s.name}"?`)) return
    const res = await fetch(`/api/operations/sites/${s.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Site deleted'); fetchSites()
  }

  const expiringSoon = useMemo(() => sites.filter(s => isExpiringSoon(s.contractEnd)).length, [sites])

  return (
    <div>
      <PageHeader title="Sites" description="Manage all client sites and contracts" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Add Site</Button>} />

      {expiringSoon > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          {expiringSoon} site contract{expiringSoon > 1 ? 's' : ''} expiring within {CONTRACT_EXPIRY_WARN_DAYS} days
        </div>
      )}

      <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1,2,3].map(i => <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse"><div className="h-3 w-40 bg-gray-200 rounded" /><div className="h-3 flex-1 bg-gray-100 rounded" /></div>)}</div>
        ) : sites.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaMapMarkerAlt} title="No sites yet" description="Add your first client site to start managing deployments" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Add Site</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-8 px-2 py-2.5"><span className="sr-only">Expand</span></th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Customer</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Guards Req.</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Active Deps.</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Contract Value</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Contract End</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <>
                    <tr key={s.id} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isExpiringSoon(s.contractEnd) ? 'bg-amber-50/40' : ''}`} onClick={() => toggleExpand(s)}>
                      <td className="px-2 py-3 text-center text-gray-400">
                        {expandedId === s.id ? <FaChevronDown className="h-3.5 w-3.5 inline" /> : <FaChevronRight className="h-3.5 w-3.5 inline" />}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#0D1B2A]">{s.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{s.guardsRequired}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${s.activeDeploymentCount >= s.guardsRequired ? 'text-green-600' : 'text-amber-600'}`}>{s.activeDeploymentCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{s.contractValue != null ? formatCurrency(Number(s.contractValue)) : '—'}</td>
                      <td className={`px-4 py-3 text-sm ${isExpiringSoon(s.contractEnd) ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>{s.contractEnd ? formatDate(new Date(s.contractEnd)) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" aria-label="Edit site"><FaPen className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => deleteSite(s)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Delete site"><FaTrash className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr key={`${s.id}-expanded`} className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={9} className="px-8 py-3">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Active Deployments</p>
                          {expandedDeployments?.length === 0 ? (
                            <p className="text-xs text-gray-400">No active deployments at this site</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {expandedDeployments?.map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs">
                                  <span className="font-medium text-[#0D1B2A]">{d.guard?.name}</span>
                                  <span className="text-gray-400">·</span>
                                  <span className="text-gray-500">{d.shift}</span>
                                  <span className="text-gray-400">·</span>
                                  <span className="text-gray-400">from {formatDate(new Date(d.startDate))}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Site' : 'New Site'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5"><Label>Site Name *</Label><Input placeholder="e.g. CBD Head Office" {...register('name', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Controller control={control} name="customerId" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent><SelectItem value="">— No customer —</SelectItem>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Guards Required</Label><Input type="number" min="1" {...register('guardsRequired')} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input placeholder="Physical address" {...register('address')} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Contract Value</Label><Input type="number" step="0.01" placeholder="0.00" {...register('contractValue')} /></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" {...register('contractStart')} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" {...register('contractEnd')} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller control={control} name="status" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem><SelectItem value="SUSPENDED">Suspended</SelectItem></SelectContent>
                </Select>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Create Site'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
