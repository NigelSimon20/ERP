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
import { ImportWizardDialog } from '@/components/shared/import-export/ImportWizardDialog'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ArrowDownloadRegular, ArrowUploadRegular, ChatRegular, CopyRegular, DeleteRegular, DocumentArrowDownRegular, EditRegular, KeyRegular, MailRegular, PeopleRegular, PersonAddRegular, PrintRegular } from '@fluentui/react-icons';

interface Guard { id: string; employeeNumber: string; name: string; idNumber: string | null; phone: string | null; email: string | null; department: string | null; rank: string | null; status: string; dailyRate: number; basicSalary: number | null; dateHired: string | null; whatsapp: string | null }
type FormValues = { name: string; idNumber: string; phone: string; email: string; address: string; department: string; position: string; rank: string; dailyRate: string; basicSalary: string; status: string; dateOfBirth: string; dateHired: string; whatsapp: string }

interface CredentialsData {
  guardId: string
  guardName: string
  guardPhone: string | null
  guardEmail: string | null
  username: string
  tempPassword: string
  role: string
}

const STATUS_STYLES: Record<string, string> = { Active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', Resigned: 'bg-muted text-muted-foreground', Blacklisted: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', Terminated: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }
const DEPARTMENTS = ['Operations', 'Finance', 'Business Development', 'HR', 'Admin']
const RANKS = ['Guard', 'Senior Guard', 'Supervisor', 'Team Leader', 'Manager', 'Admin']

const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'OPERATIONS_MANAGER', 'HR_MANAGER', 'BD_MANAGER', 'STAFF', 'GUARD', 'READ_ONLY']
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', FINANCE_MANAGER: 'Finance Manager', OPERATIONS_MANAGER: 'Operations Manager',
  HR_MANAGER: 'HR Manager', BD_MANAGER: 'Business Dev. Manager', STAFF: 'Staff', GUARD: 'Guard', READ_ONLY: 'Read Only',
}
const DEPARTMENT_MANAGER_ROLE: Record<string, string> = {
  Operations: 'OPERATIONS_MANAGER', Finance: 'FINANCE_MANAGER', HR: 'HR_MANAGER', 'Business Development': 'BD_MANAGER', Admin: 'ADMIN',
}

// Portal-only ranks (Guard/Senior Guard/Team Leader) always default to GUARD — department alone
// must never silently grant module-manager access. Only an employee explicitly ranked Manager
// (or Supervisor, one step down) gets a department-scoped elevated default, and it's still just
// a pre-fill: the admin picks the final role in the dialog before the account is created.
function defaultRoleFor(g: Guard): string {
  if (g.rank === 'Manager') return DEPARTMENT_MANAGER_ROLE[g.department ?? ''] ?? 'STAFF'
  if (g.rank === 'Supervisor') return 'STAFF'
  return 'GUARD'
}

export default function EmployeesPage() {
  const [guards, setGuards] = useState<Guard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [editing, setEditing] = useState<Guard | null>(null)
  const [credentials, setCredentials] = useState<CredentialsData | null>(null)
  const [creatingAccount, setCreatingAccount] = useState<string | null>(null)
  const [accountTarget, setAccountTarget] = useState<Guard | null>(null)
  const [accountRole, setAccountRole] = useState('GUARD')

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', idNumber: '', phone: '', email: '', address: '', department: '', position: '', rank: 'Guard', dailyRate: '', basicSalary: '', status: 'Active', dateOfBirth: '', dateHired: '', whatsapp: '' },
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
    reset({ name: '', idNumber: '', phone: '', email: '', address: '', department: '', position: '', rank: 'Guard', dailyRate: '', basicSalary: '', status: 'Active', dateOfBirth: '', dateHired: new Date().toISOString().split('T')[0], whatsapp: '' })
    setShowDialog(true)
  }

  function openEdit(g: Guard) {
    setEditing(g)
    reset({ name: g.name, idNumber: g.idNumber ?? '', phone: g.phone ?? '', email: g.email ?? '', address: '', department: g.department ?? '', position: '', rank: g.rank ?? 'Guard', dailyRate: String(Number(g.dailyRate)), basicSalary: g.basicSalary != null ? String(g.basicSalary) : '', status: g.status, dateOfBirth: '', dateHired: g.dateHired?.split('T')[0] ?? '', whatsapp: g.whatsapp ?? '' })
    setShowDialog(true)
  }

  async function onSubmit(data: FormValues) {
    const url = editing ? `/api/hr/employees/${editing.id}` : '/api/hr/employees'
    const method = editing ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, dailyRate: Number(data.dailyRate) || 0, basicSalary: data.basicSalary ? Number(data.basicSalary) : undefined }) })
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

  function openAccountDialog(g: Guard) {
    setAccountRole(defaultRoleFor(g))
    setAccountTarget(g)
  }

  async function createAccount() {
    const g = accountTarget
    if (!g || creatingAccount) return
    setCreatingAccount(g.id)
    try {
      const res = await fetch(`/api/hr/employees/${g.id}/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: accountRole }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to create account'); return }
      toast.success('Login account created!')
      setAccountTarget(null)
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

  async function exportCsv() {
    const res = await fetch('/api/hr/employees/export?format=csv')
    if (!res.ok) { toast.error('Export failed'); return }
    const blob = await res.blob()
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `employees-${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  return (
    <div>
      <PageHeader title="Employees" description="Manage guard and staff records" action={
        <div className="flex items-center gap-2">
          <a href="/api/hr/employees/import/template" className="inline-flex">
            <Button type="button" variant="outline"><DocumentArrowDownRegular className="h-4 w-4 mr-1" /> Template</Button>
          </a>
          <Button type="button" variant="outline" onClick={() => setShowImportWizard(true)}><ArrowUploadRegular className="h-4 w-4 mr-1" /> Import</Button>
          <Button type="button" variant="outline" onClick={exportCsv}><ArrowDownloadRegular className="h-4 w-4 mr-1" /> Export CSV</Button>
          <Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Employee</Button>
        </div>
      } />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search by name, emp#, or ID…" value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Resigned">Resigned</SelectItem>
            <SelectItem value="Terminated">Terminated</SelectItem>
            <SelectItem value="Blacklisted">Blacklisted</SelectItem>
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

      <div className="mt-3 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : guards.length === 0 ? (
          <div className="py-16"><EmptyState icon={PeopleRegular} title="No employees found" description="Add guards and staff members to get started" action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Employee</Button>} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Emp #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">ID Number</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Rank</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Department</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Daily Rate</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Account</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {guards.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{g.employeeNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{g.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{g.idNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{g.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{g.rank ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{g.department ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[g.status] ?? 'bg-muted text-muted-foreground'}`}>{g.status}</span></td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrency(Number(g.dailyRate))}/day</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openAccountDialog(g)}
                        disabled={creatingAccount === g.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Create login account for this employee"
                      >
                        {creatingAccount === g.id
                          ? <span className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                          : <PersonAddRegular className="h-3 w-3" />}
                        Account
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => openEdit(g)} className="p-1 rounded hover:bg-muted text-brand-muted-light hover:text-foreground" aria-label="Edit employee"><EditRegular className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => deleteGuard(g)} className="p-1 rounded hover:bg-primary/10 text-brand-muted-light hover:text-primary" aria-label="Delete employee"><DeleteRegular className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportWizardDialog
        open={showImportWizard}
        onOpenChange={setShowImportWizard}
        apiBase="/api/hr/employees/import"
        moduleLabel="Employees"
        onComplete={fetchGuards}
      />

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
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Resigned">Resigned</SelectItem>
                      <SelectItem value="Terminated">Terminated</SelectItem>
                      <SelectItem value="Blacklisted">Blacklisted</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5"><Label>Daily Rate *</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('dailyRate', { required: true })} /></div>
              <div className="space-y-1.5">
                <Label>Basic Salary (monthly)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('basicSalary')} />
                <p className="text-xs text-brand-muted-light">Used to calculate payroll — leave blank and payroll will pay $0 for this employee.</p>
              </div>
              <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" {...register('dateOfBirth')} /></div>
              <div className="space-y-1.5"><Label>Date Hired</Label><Input type="date" {...register('dateHired')} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input placeholder="Residential address" {...register('address')} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Account — role picker */}
      {accountTarget && (
        <Dialog open onOpenChange={(open) => !open && setAccountTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create Login Account</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">For {accountTarget.name} ({accountTarget.department ?? 'no department'})</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={accountRole} onValueChange={setAccountRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLE_OPTIONS.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {accountRole === 'GUARD'
                    ? 'Guard portal access only.'
                    : `Full access to the ${ROLE_LABELS[accountRole]} dashboard and module, in addition to portal access.`}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccountTarget(null)}>Cancel</Button>
              <Button type="button" disabled={creatingAccount === accountTarget.id} onClick={createAccount} className="bg-primary hover:bg-brand-red-dark text-white">
                {creatingAccount === accountTarget.id ? 'Creating…' : 'Create Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Credentials Delivery Modal */}
      {credentials && (
        <Dialog open onOpenChange={() => setCredentials(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <KeyRegular className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>Login Credentials Created</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Account for {credentials.guardName}</p>
                </div>
              </div>
            </DialogHeader>

            {/* Credentials display */}
            <div className="space-y-3 mt-2">
              <div className="bg-muted/50 rounded-xl border border-border p-4 space-y-2.5 font-mono text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-sans font-medium text-xs">Username</span>
                  <span className="text-foreground font-semibold">{credentials.username}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-sans font-medium text-xs">Temp Password</span>
                  <span className="text-primary font-bold tracking-wider">{credentials.tempPassword}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-sans font-medium text-xs">Role</span>
                  <span className="text-foreground">{credentials.role}</span>
                </div>
              </div>

              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2.5 border border-amber-200 dark:border-amber-500/30">
                ⚠️ Employee must change this password on first login. Store it securely.
              </p>

              {/* Delivery actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => sendCredentials('whatsapp', credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#1ebe5d] transition-colors"
                >
                  <ChatRegular className="h-4 w-4" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => sendCredentials('email', credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors"
                >
                  <MailRegular className="h-4 w-4" /> Email
                </button>
                <button
                  type="button"
                  onClick={() => printCredentials(credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
                >
                  <PrintRegular className="h-4 w-4" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => copyCredentials(credentials)}
                  className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
                >
                  <CopyRegular className="h-4 w-4" /> Copy
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
