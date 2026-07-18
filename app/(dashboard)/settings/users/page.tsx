'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { useCurrentUser } from '@/lib/user-context'
import { timeAgo } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  AddRegular, CheckmarkCircleRegular, CopyRegular, DeleteRegular, EditRegular, PauseRegular,
  PeopleRegular, PlayRegular, SearchRegular,
} from '@fluentui/react-icons'

interface AppUser {
  id: string
  name: string
  email: string
  role: string
  department: string | null
  phone: string | null
  whatsapp: string | null
  active: boolean
  mustChangePassword: boolean
  lastLogin: string | null
}

type CreateFormValues = { name: string; email: string; role: string; department: string; phone: string; whatsapp: string }
type EditFormValues = { role: string; department: string; phone: string; whatsapp: string; active: boolean }

const ROLE_OPTIONS = [
  'SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'OPERATIONS_MANAGER', 'HR_MANAGER',
  'BD_MANAGER', 'STAFF', 'GUARD', 'CLIENT', 'READ_ONLY',
]

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  FINANCE_MANAGER: 'Finance Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  HR_MANAGER: 'HR Manager',
  BD_MANAGER: 'Business Dev. Manager',
  STAFF: 'Staff',
  GUARD: 'Guard',
  CLIENT: 'Client',
  READ_ONLY: 'Read Only',
}

const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: 'bg-primary text-white',
  ADMIN: 'bg-primary text-white',
  FINANCE_MANAGER: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  OPERATIONS_MANAGER: 'bg-foreground text-background',
  HR_MANAGER: 'bg-brand-navy text-white',
  BD_MANAGER: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  STAFF: 'bg-muted text-muted-foreground',
  GUARD: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  CLIENT: 'bg-muted text-muted-foreground',
  READ_ONLY: 'bg-muted text-muted-foreground',
}

export default function UsersSettingsPage() {
  const currentUser = useCurrentUser()

  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [credentials, setCredentials] = useState<{ name: string; email: string; tempPassword: string } | null>(null)
  const [deleting, setDeleting] = useState<AppUser | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const createForm = useForm<CreateFormValues>({
    defaultValues: { name: '', email: '', role: 'STAFF', department: '', phone: '', whatsapp: '' },
  })
  const editForm = useForm<EditFormValues>({
    defaultValues: { role: 'STAFF', department: '', phone: '', whatsapp: '', active: true },
  })

  async function fetchUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load users'); setUsers([]); return }
      setUsers(json.users ?? [])
    } catch {
      toast.error('Network error loading users')
      setUsers([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchUsers() }, [])

  const filtered = useMemo(() => users.filter((u) => {
    const matchesSearch = !search
      || u.name.toLowerCase().includes(search.toLowerCase())
      || u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchesSearch && matchesRole
  }), [users, search, roleFilter])

  function openCreate() {
    createForm.reset({ name: '', email: '', role: 'STAFF', department: '', phone: '', whatsapp: '' })
    setShowCreate(true)
  }

  function openEdit(u: AppUser) {
    setEditing(u)
    editForm.reset({
      role: u.role,
      department: u.department ?? '',
      phone: u.phone ?? '',
      whatsapp: u.whatsapp ?? '',
      active: u.active,
    })
  }

  async function onCreate(data: CreateFormValues) {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to create user'); return }
    toast.success('User created')
    setShowCreate(false)
    setCredentials({ name: json.user.name, email: json.user.email, tempPassword: json.tempPassword })
    fetchUsers()
  }

  async function onEditSave(data: EditFormValues) {
    if (!editing) return
    const res = await fetch(`/api/users/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to update user'); return }
    toast.success('User updated')
    setEditing(null)
    fetchUsers()
  }

  async function toggleActive(u: AppUser) {
    const next = !u.active
    const verb = next ? 'reactivate' : 'deactivate'
    if (!confirm(`Are you sure you want to ${verb} ${u.name}?`)) return

    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? `Failed to ${verb} user`); return }
    toast.success(next ? 'User reactivated' : 'User deactivated')
    fetchUsers()
  }

  function openDelete(u: AppUser) {
    setDeleting(u)
    setDeleteConfirmText('')
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/users/${deleting.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to delete user'); return }
      toast.success('User deleted')
      setDeleting(null)
      fetchUsers()
    } finally {
      setDeleteSubmitting(false)
    }
  }

  function copyPassword() {
    if (!credentials) return
    navigator.clipboard.writeText(credentials.tempPassword)
    toast.success('Password copied to clipboard')
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage who can access this ERP and what they can do"
        action={
          <Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white">
            <AddRegular className="h-4 w-4 mr-1" /> Add User
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <SearchRegular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted-light" />
          <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by role"
        >
          <option value="ALL">All Roles</option>
          {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>

      <div className="erp-card !p-0 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-3 w-40 bg-muted rounded" />
                <div className="h-3 flex-1 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={PeopleRegular}
              title={users.length === 0 ? 'No users yet' : 'No users match your filters'}
              description={users.length === 0 ? 'Add your first team member to give them access' : 'Try a different search or role filter'}
              action={users.length === 0 ? { label: 'Add User', onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Last Login</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <p className="font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-brand-muted-light">{u.email}</p>
                  </td>
                  <td>
                    <span className={`erp-badge ${ROLE_BADGE[u.role] ?? 'bg-muted text-muted-foreground'}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{u.department ?? '—'}</td>
                  <td className="text-muted-foreground text-xs">{u.phone ?? '—'}</td>
                  <td className="text-muted-foreground text-xs">{u.lastLogin ? timeAgo(u.lastLogin) : 'Never'}</td>
                  <td>
                    <span className={`erp-badge ${u.active ? 'erp-badge-success' : 'erp-badge-muted'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                    {u.mustChangePassword && (
                      <span className="erp-badge erp-badge-warning ml-1">Pending setup</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground transition-colors"
                        aria-label={`Edit ${u.name}`}
                        title="Edit"
                      >
                        <EditRegular className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        disabled={u.id === currentUser.id}
                        className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={u.active ? `Deactivate ${u.name}` : `Reactivate ${u.name}`}
                        title={u.id === currentUser.id ? 'You cannot deactivate your own account' : u.active ? 'Deactivate' : 'Reactivate'}
                      >
                        {u.active ? <PauseRegular className="h-3.5 w-3.5" /> : <PlayRegular className="h-3.5 w-3.5" />}
                      </button>
                      {['SUPER_ADMIN', 'ADMIN'].includes(currentUser.role) && (
                        <button
                          type="button"
                          onClick={() => openDelete(u)}
                          disabled={u.id === currentUser.id}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-brand-muted-light hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Delete ${u.name}`}
                          title={u.id === currentUser.id ? 'You cannot delete your own account' : 'Delete permanently'}
                        >
                          <DeleteRegular className="h-3.5 w-3.5" />
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

      {/* Create User */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>A temporary password will be generated — the user must change it on first login.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input placeholder="Jane Moyo" {...createForm.register('name', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" placeholder="jane@company.com" {...createForm.register('email', { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Controller control={createForm.control} name="role" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Operations" {...createForm.register('department')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="+263…" {...createForm.register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input placeholder="+263…" {...createForm.register('whatsapp')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {createForm.formState.isSubmitting ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>{editing?.name} · {editing?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Controller control={editForm.control} name="role" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Operations" {...editForm.register('department')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input placeholder="+263…" {...editForm.register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input placeholder="+263…" {...editForm.register('whatsapp')} />
              </div>
            </div>
            <Controller control={editForm.control} name="active" render={({ field }) => (
              <div className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Account active</p>
                  <p className="text-xs text-brand-muted-light">Inactive users cannot sign in</p>
                </div>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={editing?.id === currentUser.id}
                />
              </div>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">
                {editForm.formState.isSubmitting ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Temp password reveal — shown once, right after creation */}
      <Dialog open={!!credentials} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckmarkCircleRegular className="h-5 w-5 text-green-600" />
              User Created
            </DialogTitle>
            <DialogDescription>
              Share this temporary password with {credentials?.name} securely. It will not be shown again — the account requires a password change on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</p>
              <p className="text-sm text-foreground font-medium">{credentials?.email}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Temporary Password</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 text-sm font-mono bg-card border border-border rounded-md px-3 py-2 text-foreground">
                  {credentials?.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={copyPassword}
                  className="p-2 rounded-md border border-border hover:bg-muted text-brand-muted-light hover:text-foreground transition-colors"
                  aria-label="Copy password"
                  title="Copy"
                >
                  <CopyRegular className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setCredentials(null)} className="bg-primary hover:bg-brand-red-dark text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete User Permanently</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{deleting?.name}</strong> ({deleting?.email}) and cannot be
              undone. If you just want to revoke access, deactivate the account instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Type <span className="font-mono">{deleting?.email}</span> to confirm</Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleting?.email}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              type="button"
              onClick={confirmDelete}
              disabled={deleteSubmitting || deleteConfirmText !== deleting?.email}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
