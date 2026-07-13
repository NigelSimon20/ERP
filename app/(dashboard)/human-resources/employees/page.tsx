'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { FaPlus, FaDownload, FaUsers, FaPen, FaTrash, FaUserPlus, FaWhatsapp, FaEnvelope, FaPrint, FaCopy, FaKey } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Guard { id: string; employeeNumber: string; name: string; idNumber: string | null; phone: string | null; email: string | null; department: string | null; rank: string | null; status: string; hourlyRate: number; dateHired: string | null; whatsapp: string | null }
type FormValues = { name: string; idNumber: string; phone: string; email: string; address: string; department: string; position: string; rank: string; hourlyRate: string; status: string; dateOfBirth: string; dateHired: string; whatsapp: string }

interface CredentialsData {
  guardId: string
  guardName: string
  guardPhone: string | null
  guardEmail: string | null
  username: string
  tempPassword: string
  role: string
}

const STATUS_STYLES: Record<string, string> = { ACTIVE: 'bg-green-100 text-green-700', INACTIVE: 'bg-gray-100 text-gray-500', SUSPENDED: 'bg-amber-100 text-amber-700', TERMINATED: 'bg-red-100 text-red-600' }
const DEPARTMENTS = ['Security', 'Operations', 'Administration', 'Management', 'Support']
const RANKS = ['Guard', 'Senior Guard', 'Supervisor', 'Team Leader', 'Manager']

export default function EmployeesPage() {
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<Guard | null>(null)
  const [credentials, setCredentials] = useState<CredentialsData | null>(null)
  const [creatingAccount, setCreatingAccount] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', idNumber: '', phone: '', email: '', address: '', department: '', position: '', rank: 'Guard', hourlyRate: '', status: 'ACTIVE', dateOfBirth: '', dateHired: '', whatsapp: '' },
  })

  async function fetchGuards() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterStatus) params.set('status', filterStatus)
    if (filterDept) params.set('department', filterDept)
    try {
      const res = await fetch(`/api/hr/employees?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load employees'); setGuards([]); return }
      setGuards(json.guards ?? [])
    } catch {
      toast.error('Network error loading employees')
      setGuards([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchGuards() }, [search, filterStatus, filterDept])

  function openCreate() {
    setEditing(null)
    reset({ name: '', idNumber: '', phone: '', email: '', address: '', department: '', position: '', rank: 'Guard', hourlyRate: '', status: 'ACTIVE', dateOfBirth: '', dateHired: new Date().toISOString().split('T')[0], whatsapp: '' })
    setShowDialog(true)
  }

  function openEdit(g: Guard) {
    setEditing(g)
    reset({ name: g.name, idNumber: g.idNumber ?? '', phone: g.phone ?? '', email: g.email ?? '', address: '', department: g.department ?? '', position: '', rank: g.rank ?? 'Guard', hourlyRate: String(Number(g.hourlyRate)), status: g.status, dateOfBirth: '', dateHired: g.dateHired?.split('T')[0] ?? '', whatsapp: g.whatsapp ?? '' })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/hr/employees/${editing.id}` : '/api/hr/employees'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, hourlyRate: Number(data.hourlyRate) || 0 }) })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success(editing ? 'Employee updated' : `Employee created — ${json.guard?.employeeNumber}`)
    setShowDialog(false); fetchGuards()
  }

  async function deleteGuard(g: Guard) {
    if (!confirm(`Delete ${g.name}? This cannot be undone.`)) return
    const res = await fetch(`/api/hr/employees/${g.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Employee deleted'); fetchGuards()
  }

  async function createAccount(g: Guard) {
    if (creatingAccount) return
    setCreatingAccount(g.id)
    try {
      const res = await fetch(`/api/hr/employees/${g.id}/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'GUARD' }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to create account'); return }
      toast.success('Login account created!')
      setCredentials({
        guardId: g.id,
        guardName: g.name,
        guardPhone: g.phone,
        guardEmail: g.email,
        username: json.user.username,
        tempPassword: json.user.tempPassword,
        role: json.user.role,
      })
    } catch {
      toast.error('Network error')
    } finally {
      setCreatingAccount(null)
    }
  }

  async function sendCredentials(channel: 'whatsapp' | 'email', cred: CredentialsData) {
    try {
      const res = await fetch(`/api/hr/employees/${cred.guardId}/send-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          employeeName: cred.guardName,
          username: cred.username,
          tempPassword: cred.tempPassword,
          whatsappNumber: cred.guardPhone ?? '',
          email: cred.guardEmail ?? '',
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Send failed'); return }
      toast.success(channel === 'whatsapp' ? 'Credentials sent via WhatsApp!' : 'Credentials sent via Email!')
    } catch {
      toast.error('Network error')
    }
  }

  function copyCredentials(cred: CredentialsData) {
    const text = `Username: ${cred.username}\nPassword: ${cred.tempPassword}`
    navigator.clipboard.writeText(text).then(() => toast.success('Credentials copied!')).catch(() => toast.error('Copy failed'))
  }

  function printCredentials(cred: CredentialsData) {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<pre style="font-family:monospace;padding:2em;">
Raven Shield ERP — Login Credentials
======================================
Employee : ${cred.guardName}
Username : ${cred.username}
Password : ${cred.tempPassword}
Login URL: ${window.location.origin}/login
======================================
Please change your password on first login.
    </pre>`)
    w.document.close(); w.print()
  }

  function exportCsv() {
    const rows = [
      ['Emp#', 'Name', 'ID Number', 'Phone', 'Rank', 'Department', 'Status', 'Hourly Rate', 'Date Hired'],
      ...guards.map(g => [g.employeeNumber, g.name, g.idNumber ?? '', g.phone ?? '', g.rank ?? '', g.department ?? '', g.status, Number(g.hourlyRate).toFixed(2), g.dateHired ? formatDate(new Date(g.dateHired)) : '']),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `employees-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  return (
    <div>
      <PageHeader title="Employees" description="Manage guard and staff records" action={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}><FaDownload className="h-4 w-4 mr-1" /> Export CSV</Button>
          <Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white"><FaPlus className="h-4 w-4 mr-1" /> Add Employee</Button>
        </div>
      } />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search by name, emp#, or ID…" value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="TERMINATED">Terminated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All departments</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : guards.length === 0 ? (
          <div className="py-16"><EmptyState icon={FaUsers} title="No employees found" description="Add guards and staff members to get started" action={<Button type="button" onClick={openCreate} className="bg-[#CC0000] hover:bg-[#AA0000] text-white mt-3"><FaPlus className="h-4 w-4 mr-1" /> Add Employee</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Emp #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">ID Number</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Rank</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Department</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Hourly Rate</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Account</th>
                  <th className="px-4 py-2.5 font-medium text-gray-600 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {guards.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{g.employeeNumber}</td>
                    <td className="px-4 py-3 font-medium text-[#0D1B2A]">{g.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.idNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.rank ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{g.department ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[g.status] ?? 'bg-gray-100 text-gray-600'}`}>{g.status}</span></td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(Number(g.hourlyRate))}/hr</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => createAccount(g)}
                        disabled={creatingAccount === g.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FDEDEE] text-[#E74C5B] hover:bg-[#E74C5B] hover:text-white text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Create login account for this employee"
                      >
                        {creatingAccount === g.id
                          ? <span className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                          : <FaUserPlus className="h-3 w-3" />}
                        Account
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => openEdit(g)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" aria-label="Edit employee"><FaPen className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteGuard(g)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Delete employee"><FaTrash className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Employee' : 'New Employee'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5"><Label>Full Name *</Label><Input placeholder="Full name" {...register('name', { required: true })} /></div>
              <div className="space-y-1.5"><Label>ID / Passport Number</Label><Input placeholder="ID number" {...register('idNumber')} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input placeholder="+263…" {...register('phone')} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="email@example.com" {...register('email')} /></div>
              <div className="space-y-1.5"><Label>WhatsApp</Label><Input placeholder="+263…" {...register('whatsapp')} /></div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Controller control={control} name="department" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Position / Title</Label><Input placeholder="e.g. Site Supervisor" {...register('position')} /></div>
              <div className="space-y-1.5">
                <Label>Rank</Label>
                <Controller control={control} name="rank" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RANKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller control={control} name="status" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended</SelectItem>
                      <SelectItem value="TERMINATED">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Hourly Rate *</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('hourlyRate', { required: true })} /></div>
              <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" {...register('dateOfBirth')} /></div>
              <div className="space-y-1.5"><Label>Date Hired</Label><Input type="date" {...register('dateHired')} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input placeholder="Residential address" {...register('address')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-[#CC0000] hover:bg-[#AA0000] text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Credentials Delivery Modal */}
      {credentials && (
        <Dialog open onOpenChange={() => setCredentials(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-[#FDEDEE] flex items-center justify-center">
                  <FaKey className="h-5 w-5 text-[#E74C5B]" />
                </div>
                <div>
                  <DialogTitle>Login Credentials Created</DialogTitle>
                  <p className="text-xs text-gray-500 mt-0.5">Account for {credentials.guardName}</p>
                </div>
              </div>
            </DialogHeader>

            {/* Credentials display */}
            <div className="space-y-3 mt-2">
              <div className="bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-4 space-y-2.5 font-mono text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-sans font-medium text-xs">Username</span>
                  <span className="text-[#111827] font-semibold">{credentials.username}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-sans font-medium text-xs">Temp Password</span>
                  <span className="text-[#E74C5B] font-bold tracking-wider">{credentials.tempPassword}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 font-sans font-medium text-xs">Role</span>
                  <span className="text-[#111827]">{credentials.role}</span>
                </div>
              </div>

              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-200">
                ⚠️ Employee must change this password on first login. Store it securely.
              </p>

              {/* Delivery actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => sendCredentials('whatsapp', credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#1ebe5d] transition-colors"
                >
                  <FaWhatsapp className="h-4 w-4" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => sendCredentials('email', credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl bg-[#3B82F6] text-white text-sm font-semibold hover:bg-[#2563EB] transition-colors"
                >
                  <FaEnvelope className="h-4 w-4" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => printCredentials(credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl border border-[#E5E7EB] text-[#374151] text-sm font-medium hover:bg-[#F9FAFB] transition-colors"
                >
                  <FaPrint className="h-4 w-4" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => copyCredentials(credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl border border-[#E5E7EB] text-[#374151] text-sm font-medium hover:bg-[#F9FAFB] transition-colors"
                >
                  <FaCopy className="h-4 w-4" /> Copy
                </button>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setCredentials(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
