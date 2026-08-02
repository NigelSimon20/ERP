'use client'

import { useState, useEffect } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  useDraggable, useDroppable, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { AddRegular, GridRegular, ListRegular } from '@fluentui/react-icons';
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Lead { id: string; companyName: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null; status: string; estimatedValue: number | null; probability: number; source: string | null; notes: string | null; createdAt: string; assignedUser: { id: string; name: string } | null }
interface User { id: string; name: string }
type CreateForm = { companyName: string; contactName: string; contactEmail: string; contactPhone: string; source: string; status: string; estimatedValue: string; probability: string; assignedUserId: string; notes: string }

// Matches the real Prisma LeadStatus enum exactly -- these values are what
// actually get persisted, unlike the previous INQUIRY/PROPOSAL/ON_HOLD set
// (3 of 7 stages, including the default) which don't exist in the enum at
// all and made lead creation fail silently every time.
const STAGES = [
  { id: 'NEW', label: 'New', color: 'bg-muted border-border text-muted-foreground' },
  { id: 'CONTACTED', label: 'Contacted', color: 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-500/15 dark:border-slate-500/30 dark:text-slate-400' },
  { id: 'QUALIFIED', label: 'Qualified', color: 'bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/30 dark:text-blue-400' },
  { id: 'PROPOSAL_SENT', label: 'Proposal Sent', color: 'bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400' },
  { id: 'NEGOTIATION', label: 'Negotiation', color: 'bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-500/15 dark:border-orange-500/30 dark:text-orange-400' },
  { id: 'WON', label: 'Won', color: 'bg-green-100 border-green-200 text-green-700 dark:bg-green-500/15 dark:border-green-500/30 dark:text-green-400' },
  { id: 'LOST', label: 'Lost', color: 'bg-primary/10 border-primary/20 text-primary dark:bg-primary/15 dark:text-red-300' },
]

const STAGE_BADGE: Record<string, string> = { NEW: 'bg-muted text-muted-foreground', CONTACTED: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400', QUALIFIED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', PROPOSAL_SENT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', NEGOTIATION: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400', WON: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', LOST: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300' }
const SOURCES = ['Website', 'Referral', 'Cold Call', 'Email', 'Social Media', 'Event', 'Partner', 'Other']

function DraggableCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className={`bg-card border border-border rounded-lg p-3 cursor-grab shadow-sm hover:shadow-md transition-shadow ${isDragging ? 'invisible' : ''}`}
    >
      <p className="font-medium text-sm text-foreground truncate">{lead.companyName}</p>
      {lead.contactName && <p className="text-xs text-brand-muted-light mt-0.5 truncate">{lead.contactName}</p>}
      <div className="flex items-center justify-between mt-2">
        {lead.estimatedValue != null && <span className="text-xs font-semibold text-green-700 dark:text-green-400">{formatCurrency(Number(lead.estimatedValue))}</span>}
        <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 ml-auto">{lead.probability}%</span>
      </div>
      {lead.assignedUser && <p className="text-xs text-brand-muted-light mt-1.5 truncate">{lead.assignedUser.name}</p>}
    </div>
  )
}

function DroppableColumn({ stage, leads }: { stage: typeof STAGES[0]; leads: Lead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const totalValue = leads.reduce((s, l) => s + Number(l.estimatedValue ?? 0), 0)
  return (
    <div className="flex flex-col w-56 shrink-0">
      <div className={`rounded-t-lg border px-3 py-2 ${stage.color}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{stage.label}</span>
          <span className="text-xs font-medium bg-white/50 rounded-full px-1.5">{leads.length}</span>
        </div>
        {totalValue > 0 && <p className="text-xs mt-0.5 opacity-75">{formatCurrency(totalValue)}</p>}
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[200px] border border-t-0 border-border rounded-b-lg p-2 space-y-2 transition-colors ${isOver ? 'bg-primary/5' : 'bg-muted/50'}`}>
        {leads.map((lead) => <DraggableCard key={lead.id} lead={lead} />)}
      </div>
    </div>
  )
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [lostTarget, setLostTarget] = useState<{ id: string; currentStatus: string } | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pipelineValue, setPipelineValue] = useState(0)
  const [totalPipeline, setTotalPipeline] = useState(0)

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor))

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<CreateForm>({
    defaultValues: { companyName: '', contactName: '', contactEmail: '', contactPhone: '', source: '', status: 'NEW', estimatedValue: '', probability: '20', assignedUserId: '', notes: '' },
  })

  async function fetchLeads() {
    setLoading(true)
    try {
      const res = await fetch('/api/bd/leads')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load leads'); setLeads([]); setPipelineValue(0); setTotalPipeline(0); return }
      setLeads(json.leads ?? [])
      setPipelineValue(json.pipelineValue ?? 0)
      setTotalPipeline(json.totalPipeline ?? 0)
    } catch {
      toast.error('Network error loading leads')
      setLeads([])
      setPipelineValue(0)
      setTotalPipeline(0)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchLeads() }, [])
  useEffect(() => { fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? [])).catch((err) => console.error(err)) }, [])

  async function onCreate(data: CreateForm) {
    const res = await fetch('/api/bd/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, estimatedValue: data.estimatedValue ? Number(data.estimatedValue) : null, probability: Number(data.probability), assignedUserId: data.assignedUserId || null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Lead created'); setShowCreateDialog(false); reset(); fetchLeads()
  }

  async function updateLeadStatus(leadId: string, newStatus: string, extra?: { lostReason?: string }) {
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
    const res = await fetch(`/api/bd/leads/${leadId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, ...extra }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    if (json.newCustomerId) toast.success(`Lead won! Customer record created.`, { duration: 5000 })
    else if (newStatus === 'WON') toast.success('Lead marked as Won!')
    fetchLeads()
  }

  function handleDragStart(event: DragStartEvent) { setActiveId(String(event.active.id)) }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const leadId = String(active.id)
    const newStatus = String(over.id)
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus || !STAGES.find(s => s.id === newStatus)) return
    if (newStatus === 'LOST') { setLostTarget({ id: leadId, currentStatus: lead.status }); return }
    updateLeadStatus(leadId, newStatus)
  }

  async function confirmLost() {
    if (!lostTarget) return
    if (!lostReason.trim()) { toast.error('Please provide a reason for losing this lead'); return }
    await updateLeadStatus(lostTarget.id, 'LOST', { lostReason })
    setLostTarget(null); setLostReason('')
  }

  const activeLeadCard = activeId ? leads.find(l => l.id === activeId) : null
  const activeLeads = leads.filter(l => !['WON', 'LOST'].includes(l.status))

  return (
    <div>
      <PageHeader title="Leads" description="Manage your sales pipeline" action={
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button type="button" onClick={() => setView('kanban')} className={`p-2 ${view === 'kanban' ? 'bg-brand-navy text-white' : 'text-brand-muted-light hover:text-foreground'}`} aria-label="Kanban view"><GridRegular className="h-4 w-4" /></button>
            <button type="button" onClick={() => setView('list')} className={`p-2 ${view === 'list' ? 'bg-brand-navy text-white' : 'text-brand-muted-light hover:text-foreground'}`} aria-label="List view"><ListRegular className="h-4 w-4" /></button>
          </div>
          <Button type="button" onClick={() => { reset(); setShowCreateDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Add Lead</Button>
        </div>
      } />

      {/* Pipeline Summary */}
      <div className="mt-4 flex items-center gap-6 rounded-lg border border-border bg-card px-5 py-3 text-sm">
        <div><span className="text-brand-muted-light mr-2">Total Leads</span><span className="font-semibold text-foreground">{leads.length}</span></div>
        <div className="h-4 w-px bg-muted" />
        <div><span className="text-brand-muted-light mr-2">Pipeline</span><span className="font-semibold text-foreground">{formatCurrency(totalPipeline)}</span></div>
        <div className="h-4 w-px bg-muted" />
        <div><span className="text-brand-muted-light mr-2">Weighted</span><span className="font-semibold text-green-700 dark:text-green-400">{formatCurrency(pipelineValue)}</span></div>
        <div className="ml-auto text-xs text-brand-muted-light">{activeLeads.length} active · {leads.filter(l => l.status === 'WON').length} won · {leads.filter(l => l.status === 'LOST').length} lost</div>
      </div>

      {loading ? (
        <div className="mt-6 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : leads.length === 0 ? (
        <div className="mt-8"><EmptyState icon={GridRegular} title="No leads yet" description="Start building your pipeline by adding your first lead" action={<Button type="button" onClick={() => setShowCreateDialog(true)} className="bg-primary hover:bg-brand-red-dark text-white mt-3"><AddRegular className="h-4 w-4 mr-1" /> Add Lead</Button>} /></div>
      ) : view === 'kanban' ? (
        /* ── Kanban ── */
        <div className="mt-4 overflow-x-auto pb-4">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex gap-3 min-w-max">
              {STAGES.map((stage) => (
                <DroppableColumn key={stage.id} stage={stage} leads={leads.filter(l => l.status === stage.id)} />
              ))}
            </div>
            <DragOverlay>
              {activeLeadCard && (
                <div className="bg-card border border-border rounded-lg p-3 shadow-xl w-52 opacity-90 cursor-grabbing">
                  <p className="font-medium text-sm text-foreground truncate">{activeLeadCard.companyName}</p>
                  {activeLeadCard.estimatedValue != null && <span className="text-xs font-semibold text-green-700 dark:text-green-400">{formatCurrency(Number(activeLeadCard.estimatedValue))}</span>}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        /* ── List ── */
        <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Phone</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Value</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Prob%</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Stage</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Assigned</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{lead.companyName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{lead.contactName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{lead.contactPhone ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{lead.estimatedValue != null ? formatCurrency(Number(lead.estimatedValue)) : '—'}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{lead.probability}%</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={async (e) => {
                        const newStatus = e.target.value
                        if (newStatus === 'LOST') { setLostTarget({ id: lead.id, currentStatus: lead.status }); return }
                        await updateLeadStatus(lead.id, newStatus)
                      }}
                      className="text-xs rounded-full border-0 bg-transparent font-medium cursor-pointer focus:ring-1 focus:ring-gray-300"
                      aria-label="Lead stage"
                    >
                      {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{lead.assignedUser?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-brand-muted-light text-xs">{new Date(lead.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Lead Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5"><Label>Company Name *</Label><Input placeholder="Prospect company" {...register('companyName', { required: true })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Contact Name *</Label><Input placeholder="Full name" {...register('contactName', { required: true })} /></div>
              <div className="space-y-1.5"><Label>Phone *</Label><Input placeholder="+263…" {...register('contactPhone', { required: true })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" placeholder="contact@company.com" {...register('contactEmail')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Controller control={control} name="source" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Controller control={control} name="status" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Est. Value ($)</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('estimatedValue')} /></div>
              <div className="space-y-1.5"><Label>Probability (%)</Label><Input type="number" min="0" max="100" {...register('probability')} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Controller control={control} name="assignedUserId" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent><SelectItem value="">— Unassigned —</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} placeholder="Any notes about this lead…" {...register('notes')} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Create Lead'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Lost Reason Dialog */}
      <Dialog open={!!lostTarget} onOpenChange={(open) => { if (!open) { setLostTarget(null); setLostReason('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark as Lost — Reason Required</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please provide a reason why this lead was lost.</p>
            <div className="space-y-1.5">
              <Label>Lost Reason *</Label>
              <Textarea placeholder="e.g. Budget constraints, went with competitor…" rows={3} value={lostReason} onChange={e => setLostReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setLostTarget(null); setLostReason('') }}>Cancel</Button>
            <Button type="button" onClick={confirmLost} className="bg-primary hover:bg-brand-red-dark text-white">Mark as Lost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
