'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/EmptyState'
import { PortalCard, type PortalCardData } from '@/components/portals/PortalCard'
import {
  AddRegular, ArrowUpRegular, ArrowDownRegular, DeleteRegular, EditRegular,
  PlugConnectedRegular, GlobeRegular, ArrowUploadRegular,
} from '@fluentui/react-icons'
import { ROLE_OPTIONS, ROLE_LABELS, CATEGORY_OPTIONS, CATEGORY_LABELS, CATEGORY_BADGE, OPEN_BEHAVIOR_LABELS } from '@/lib/portals'
import { PORTAL_ICON_OPTIONS } from '@/lib/portal-icons'

interface Portal {
  id: string
  name: string
  category: string
  description: string
  url: string
  logoUrl: string | null
  icon: string | null
  colorPrimary: string | null
  colorSecondary: string | null
  buttonText: string
  openBehavior: string
  isActive: boolean
  isSystem: boolean
  displayOrder: number
  supportContact: string | null
  roles: string[]
}

interface FormState {
  name: string
  category: string
  description: string
  url: string
  logoUrl: string
  icon: string
  colorPrimary: string
  colorSecondary: string
  buttonText: string
  openBehavior: string
  isActive: boolean
  supportContact: string
  roles: string[]
}

const EMPTY_FORM: FormState = {
  name: '', category: 'EXTERNAL', description: '', url: '', logoUrl: '', icon: 'Globe',
  colorPrimary: '#DC2626', colorSecondary: '', buttonText: 'Open Portal', openBehavior: 'NEW_TAB',
  isActive: true, supportContact: '', roles: ['SUPER_ADMIN', 'ADMIN'],
}

export default function PortalsTab() {
  const [portals, setPortals] = useState<Portal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Portal | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Portal | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchPortals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/portals?scope=admin')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load portals'); return }
      setPortals(json.portals ?? [])
    } catch {
      toast.error('Network error loading portals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPortals() }, [fetchPortals])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Portal) {
    setEditing(p)
    setForm({
      name: p.name, category: p.category, description: p.description, url: p.url,
      logoUrl: p.logoUrl ?? '', icon: p.icon ?? 'Globe', colorPrimary: p.colorPrimary ?? '#DC2626',
      colorSecondary: p.colorSecondary ?? '', buttonText: p.buttonText, openBehavior: p.openBehavior,
      isActive: p.isActive, supportContact: p.supportContact ?? '', roles: p.roles,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name || !form.description || !form.url || form.roles.length === 0) {
      toast.error('Name, description, URL, and at least one role are required')
      return
    }
    setSaving(true)
    try {
      const url = editing ? `/api/portals/${editing.id}` : '/api/portals'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          logoUrl: form.logoUrl || null,
          colorSecondary: form.colorSecondary || null,
          supportContact: form.supportContact || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to save portal'); return }
      toast.success(editing ? 'Portal updated' : 'Portal added')
      setShowForm(false)
      fetchPortals()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Portal) {
    const res = await fetch(`/api/portals/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to update portal'); return }
    toast.success(p.isActive ? 'Portal disabled' : 'Portal enabled')
    fetchPortals()
  }

  async function move(p: Portal, direction: -1 | 1) {
    const sorted = [...portals].sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = sorted.findIndex((x) => x.id === p.id)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[swapIdx]
    const res = await fetch('/api/portals/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: [{ id: a.id, displayOrder: b.displayOrder }, { id: b.id, displayOrder: a.displayOrder }] }),
    })
    if (!res.ok) { toast.error('Failed to reorder'); return }
    fetchPortals()
  }

  async function confirmDelete() {
    if (!deleting) return
    const res = await fetch(`/api/portals/${deleting.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to delete portal'); return }
    toast.success('Portal deleted')
    setDeleting(null)
    fetchPortals()
  }

  async function testConnection(p: Portal) {
    setTesting(p.id)
    try {
      const res = await fetch(`/api/portals/${p.id}/test-connection`, { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        toast.success(`Reachable — HTTP ${json.status} in ${json.latencyMs}ms`)
      } else {
        toast.error(json.error ? `Unreachable: ${json.error}` : `Unreachable — HTTP ${json.status ?? '?'}`)
      }
    } finally {
      setTesting(null)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'portal-logos')
      const res = await fetch('/api/files', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Upload failed'); return }
      setForm((f) => ({ ...f, logoUrl: `/api/files/${json.file.id}/download` }))
      toast.success('Logo uploaded')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function toggleRole(role: string) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }))
  }

  const previewData: PortalCardData = {
    id: 'preview',
    name: form.name || 'Portal Name',
    category: form.category,
    description: form.description || 'Portal description will appear here.',
    logoUrl: form.logoUrl || null,
    icon: form.icon,
    colorPrimary: form.colorPrimary,
    buttonText: form.buttonText || 'Open Portal',
    openBehavior: form.openBehavior,
    isActive: form.isActive,
  }

  const sorted = [...portals].sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm leading-6 text-slate-600">
          Manage the External Portals Hub — add, brand, and permission any internal or third-party portal (government, banking, telecoms, and more). Changes appear immediately, no code changes required.
        </p>
        <Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white shrink-0">
          <AddRegular className="h-4 w-4 mr-1" /> Add Portal
        </Button>
      </div>

      <div className="erp-card !p-0 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-3 flex-1 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={GlobeRegular}
              title="No portals yet"
              description="Add your first portal to make it available on the External Portals hub"
              action={{ label: 'Add Portal', onClick: openCreate }}
            />
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Portal</th>
                <th>Category</th>
                <th>Roles</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <button type="button" disabled={i === 0} onClick={() => move(p, -1)} className="text-brand-muted-light hover:text-foreground disabled:opacity-20" aria-label="Move up">
                          <ArrowUpRegular className="h-3 w-3" />
                        </button>
                        <button type="button" disabled={i === sorted.length - 1} onClick={() => move(p, 1)} className="text-brand-muted-light hover:text-foreground disabled:opacity-20" aria-label="Move down">
                          <ArrowDownRegular className="h-3 w-3" />
                        </button>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-brand-muted-light truncate max-w-xs">{p.url}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`erp-badge ${CATEGORY_BADGE[p.category] ?? 'bg-muted text-muted-foreground'}`}>
                      {CATEGORY_LABELS[p.category] ?? p.category}
                    </span>
                  </td>
                  <td className="text-xs text-muted-foreground">{p.roles.length} role{p.roles.length === 1 ? '' : 's'}</td>
                  <td>
                    <button type="button" onClick={() => toggleActive(p)} className={`erp-badge ${p.isActive ? 'erp-badge-success' : 'erp-badge-muted'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => testConnection(p)}
                        disabled={testing === p.id}
                        className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground transition-colors disabled:opacity-40"
                        title="Test connection"
                      >
                        <PlugConnectedRegular className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded hover:bg-muted text-brand-muted-light hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <EditRegular className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(p)}
                        disabled={p.isSystem}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-brand-muted-light hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={p.isSystem ? 'Built-in portals cannot be deleted — disable instead' : 'Delete'}
                      >
                        <DeleteRegular className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Portal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Portal' : 'Add Portal'}</DialogTitle>
            <DialogDescription>Configure how this portal appears and who can access it on the External Portals hub.</DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Portal Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. NSSA eServices" />
              </div>

              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Description *</Label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-0 textarea"
                  rows={3}
                  placeholder="What this portal is for"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Portal URL *</Label>
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
              </div>

              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-2">
                  <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="Logo URL" />
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleUpload} />
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    <ArrowUploadRegular className="h-4 w-4 mr-1" /> {uploading ? 'Uploading…' : 'Upload'}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Fallback Icon</Label>
                <Select value={form.icon} onValueChange={(v) => setForm({ ...form, icon: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PORTAL_ICON_OPTIONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-brand-muted-light">Used when no logo is set.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Primary Colour</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.colorPrimary || '#DC2626'} onChange={(e) => setForm({ ...form, colorPrimary: e.target.value })} className="h-9 w-9 rounded border border-border" />
                    <Input value={form.colorPrimary} onChange={(e) => setForm({ ...form, colorPrimary: e.target.value })} placeholder="#DC2626" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Secondary Colour</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.colorSecondary || '#111827'} onChange={(e) => setForm({ ...form, colorSecondary: e.target.value })} className="h-9 w-9 rounded border border-border" />
                    <Input value={form.colorSecondary} onChange={(e) => setForm({ ...form, colorSecondary: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Button Text</Label>
                <Input value={form.buttonText} onChange={(e) => setForm({ ...form, buttonText: e.target.value })} placeholder="Open Portal" />
              </div>

              <div className="space-y-1.5">
                <Label>Open Behaviour</Label>
                <Select value={form.openBehavior} onValueChange={(v) => setForm({ ...form, openBehavior: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(OPEN_BEHAVIOR_LABELS).map((k) => <SelectItem key={k} value={k}>{OPEN_BEHAVIOR_LABELS[k]}</SelectItem>)}</SelectContent>
                </Select>
                {form.openBehavior === 'EMBEDDED' && (
                  <p className="text-xs text-amber-600">Some external sites block being embedded for security reasons (e.g. government/banking portals) — a "open in new tab" fallback is always shown.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Support Contact</Label>
                <Input value={form.supportContact} onChange={(e) => setForm({ ...form, supportContact: e.target.value })} placeholder="Optional — email or phone" />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Active</p>
                  <p className="text-xs text-brand-muted-light">Inactive portals are hidden from the hub</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>

              <div className="space-y-1.5">
                <Label>Role Access *</Label>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border p-3">
                  {ROLE_OPTIONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} className="rounded border-border" />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Preview</Label>
            <div className="max-w-sm">
              <PortalCard portal={previewData} showStatus />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="bg-primary hover:bg-brand-red-dark text-white">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Portal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Portal */}
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Portal</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{deleting?.name}</strong> from the hub. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button type="button" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
