'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WhatsAppReminderToggle } from '@/components/tasks/WhatsAppReminderToggle'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, ArrowDownloadRegular, ArrowTrendingRegular, ChatRegular, CheckmarkCircleRegular, CheckmarkRegular, ClipboardTaskListLtrRegular, ClockRegular, DeleteRegular, DismissCircleRegular, EditRegular, FilterRegular, FlagRegular, SearchRegular, WarningRegular } from '@fluentui/react-icons';

interface User { id: string; name: string; whatsapp: string | null }
interface Task {
  id: string; title: string; description: string | null; assignedTo: string;
  dueDate: string; priority: string; status: string; whatsappReminder: boolean;
  reminderTime: string | null; completedAt: string | null;
  assignedToUser: User | null; assignedByUser: User | null
}
type FormValues = { title: string; description: string; assignedTo: string; dueDate: string; priority: string; status: string }

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
  LOW:    { label: 'Low',    cls: 'erp-badge erp-badge-low'    },
  MEDIUM: { label: 'Medium', cls: 'erp-badge erp-badge-medium' },
  HIGH:   { label: 'High',   cls: 'erp-badge erp-badge-high'   },
  URGENT: { label: 'Urgent', cls: 'erp-badge erp-badge-urgent' },
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:     { label: 'Pending',     cls: 'erp-badge erp-badge-muted'   },
  IN_PROGRESS: { label: 'In Progress', cls: 'erp-badge erp-badge-info'    },
  COMPLETED:   { label: 'Completed',   cls: 'erp-badge erp-badge-success' },
  CANCELLED:   { label: 'Cancelled',   cls: 'erp-badge erp-badge-danger'  },
}

function isOverdue(task: Task) {
  return task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && new Date(task.dueDate) < new Date()
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

/* ── Stats Card ─────────────────────────────────────────────────────────────── */
function StatsCard({ title, value, icon: Icon, iconCls, bgCls }: {
  title: string; value: number; icon: React.ElementType; iconCls: string; bgCls: string
}) {
  return (
    <div className="erp-card flex items-center gap-4 !p-5">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0 ${bgCls}`}>
        <Icon className={`h-5 w-5 ${iconCls}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground leading-none tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{title}</p>
      </div>
    </div>
  )
}

/* ── Task Table Row ─────────────────────────────────────────────────────────── */
function TaskRow({ task, onEdit, onDelete, onComplete }: {
  task: Task
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
  onComplete: (t: Task) => void
}) {
  const overdue = isOverdue(task)
  const p = PRIORITY_CFG[task.priority]
  const s = STATUS_CFG[task.status]

  return (
    <tr className={`group border-b border-border transition-colors duration-100 hover:bg-muted/50 ${overdue ? '' : ''}`}>
      <td className="px-5 py-4">
        <div className="flex items-start gap-2.5 min-w-0">
          {overdue && <WarningRegular className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight truncate max-w-[260px]">{task.title}</p>
            {task.description && (
              <p className="text-xs text-brand-muted-light mt-0.5 truncate max-w-[260px]">{task.description}</p>
            )}
            {overdue && (
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Overdue</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        {task.assignedToUser ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold flex-shrink-0">
              {initials(task.assignedToUser.name)}
            </div>
            <span className="text-sm text-foreground truncate max-w-[140px]">{task.assignedToUser.name}</span>
          </div>
        ) : (
          <span className="text-sm text-border">—</span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className={`flex items-center gap-1.5 text-sm ${overdue ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
          <ClockRegular className="h-3 w-3 flex-shrink-0" />
          {formatDate(task.dueDate)}
        </div>
      </td>
      <td className="px-5 py-4">
        <span className={p?.cls ?? 'erp-badge erp-badge-muted'}>{p?.label ?? task.priority}</span>
      </td>
      <td className="px-5 py-4">
        <span className={s?.cls ?? 'erp-badge erp-badge-muted'}>{s?.label ?? task.status.replace('_', ' ')}</span>
      </td>
      <td className="px-5 py-4 text-center">
        {task.whatsappReminder && <ChatRegular className="h-4 w-4 text-[#25D366] mx-auto" />}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
            <button type="button" onClick={() => onComplete(task)}
              className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/15 text-brand-muted-light hover:text-green-700 dark:hover:text-green-400 transition-colors" title="Mark complete">
              <CheckmarkCircleRegular className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onEdit(task)}
            className="p-1.5 rounded-lg hover:bg-border text-brand-muted-light hover:text-foreground transition-colors" title="Edit">
            <EditRegular className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => onDelete(task)}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-brand-muted-light hover:text-primary transition-colors" title="Delete">
            <DeleteRegular className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ── Task Table ─────────────────────────────────────────────────────────────── */
function TaskTable({ items, loading, onEdit, onDelete, onComplete }: {
  items: Task[]; loading: boolean
  onEdit: (t: Task) => void; onDelete: (t: Task) => void; onComplete: (t: Task) => void
}) {
  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center gap-3">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-brand-muted-light">Loading tasks…</p>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center gap-4">
        <div className="erp-icon-box-lg"><ClipboardTaskListLtrRegular className="h-6 w-6" /></div>
        <div className="text-center">
          <p className="font-semibold text-foreground">No tasks found</p>
          <p className="text-sm text-brand-muted-light mt-1">Try adjusting filters or create a new task</p>
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="erp-table w-full min-w-[820px]">
        <thead>
          <tr>
            <th className="pl-5">Task</th>
            <th>Assigned To</th>
            <th>Due Date</th>
            <th>Priority</th>
            <th>Status</th>
            <th className="text-center">WA</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(task => (
            <TaskRow key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────────── */
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [waReminder, setWaReminder] = useState(false)
  const [reminderTime, setReminderTime] = useState<Date | null>(null)
  const [selectedAssigneeWa, setSelectedAssigneeWa] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { title: '', description: '', assignedTo: '', dueDate: '', priority: 'MEDIUM', status: 'PENDING' },
  })
  const watchAssignedTo = watch('assignedTo')

  useEffect(() => {
    const u = users.find(u => u.id === watchAssignedTo)
    setSelectedAssigneeWa(u?.whatsapp ?? null)
  }, [watchAssignedTo, users])

  const fetchTasks = useCallback(async (myTasks = false) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (myTasks) p.set('myTasks', 'true')
    if (statusFilter) p.set('status', statusFilter)
    if (priorityFilter) p.set('priority', priorityFilter)
    if (search) p.set('search', search)
    try {
      const res = await fetch(`/api/tasks/tasks?${p}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load tasks'); setTasks([]); return }
      setTasks(json.tasks ?? [])
    } catch {
      toast.error('Network error loading tasks')
      setTasks([])
    } finally { setLoading(false) }
  }, [statusFilter, priorityFilter, search])

  useEffect(() => { fetchTasks() }, [])
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(j => setUsers(j.users ?? [])).catch((err) => {
      console.error(err)
      toast.error('Failed to load users')
    })
  }, [])

  function resetForm() { reset(); setWaReminder(false); setReminderTime(null); setSelectedAssigneeWa(null) }

  async function onSubmit(data: FormValues) {
    const isEdit = !!editTask
    const url = isEdit ? `/api/tasks/tasks/${editTask!.id}` : '/api/tasks/tasks'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, whatsappReminder: waReminder, reminderTime: reminderTime?.toISOString() ?? null }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    if (json.warning) toast(json.warning, { icon: '⚠️' })
    toast.success(isEdit ? 'Task updated' : 'Task created')
    setShowCreate(false); setEditTask(null); resetForm()
    fetchTasks()
  }

  async function markComplete(task: Task) {
    const res = await fetch(`/api/tasks/tasks/${task.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    if (!res.ok) { toast.error('Failed'); return }
    toast.success('Task marked complete')
    fetchTasks()
  }

  async function deleteTask(task: Task) {
    if (!confirm(`Delete "${task.title}"?`)) return
    await fetch(`/api/tasks/tasks/${task.id}`, { method: 'DELETE' })
    toast.success('Task deleted')
    fetchTasks()
  }

  function openEdit(task: Task) {
    setEditTask(task)
    reset({
      title: task.title, description: task.description ?? '',
      assignedTo: task.assignedTo, dueDate: task.dueDate.split('T')[0],
      priority: task.priority, status: task.status,
    })
    setWaReminder(task.whatsappReminder)
    setReminderTime(task.reminderTime ? new Date(task.reminderTime) : null)
    setSelectedAssigneeWa(task.assignedToUser?.whatsapp ?? null)
    setShowCreate(true)
  }

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'PENDING').length,
    inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
    completed: tasks.filter(t => t.status === 'COMPLETED').length,
    overdue: tasks.filter(t => isOverdue(t)).length,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-brand-muted-light uppercase tracking-widest mb-1">Task Management</p>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage and track all team assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="erp-btn erp-btn-ghost erp-btn-sm">
            <ArrowDownloadRegular className="h-3.5 w-3.5" /> Export
          </button>
          <button
            type="button"
            onClick={() => { resetForm(); setEditTask(null); setShowCreate(true) }}
            className="erp-btn erp-btn-primary"
          >
            <AddRegular className="h-3.5 w-3.5" /> New Task
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard title="Total Tasks"  value={stats.total}      icon={ClipboardTaskListLtrRegular}      iconCls="text-primary" bgCls="bg-primary/10" />
        <StatsCard title="Pending"      value={stats.pending}    icon={ClockRegular}     iconCls="text-muted-foreground" bgCls="bg-border" />
        <StatsCard title="In Progress"  value={stats.inProgress} icon={ArrowTrendingRegular}          iconCls="text-blue-600 dark:text-blue-400" bgCls="bg-blue-100 dark:bg-blue-500/15" />
        <StatsCard title="Completed"    value={stats.completed}  icon={CheckmarkRegular}               iconCls="text-green-600 dark:text-green-400" bgCls="bg-green-100 dark:bg-green-500/15" />
        <StatsCard title="Overdue"      value={stats.overdue}    icon={WarningRegular} iconCls="text-amber-600 dark:text-amber-400" bgCls="bg-amber-100 dark:bg-amber-500/15" />
      </div>

      {/* ── Table Card ── */}
      <div className="erp-card !p-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap px-5 py-4 border-b border-border">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <SearchRegular className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-muted-light pointer-events-none" />
            <input
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchTasks()}
              className="erp-field !h-9 pl-9 !rounded-lg"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="erp-select !h-9 !rounded-lg w-36"
            aria-label="Filter by priority"
          >
            <option value="">All Priorities</option>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => (
              <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="erp-select !h-9 !rounded-lg w-36"
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <button type="button" onClick={() => fetchTasks()} className="erp-btn erp-btn-ghost erp-btn-sm">
            <FilterRegular className="h-3 w-3" /> Apply
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" onValueChange={v => fetchTasks(v === 'mine')}>
          <div className="px-5 border-b border-border">
            <TabsList className="bg-transparent p-0 gap-0 h-auto rounded-none">
              {[
                { value: 'all',  label: 'All Tasks', count: tasks.length },
                { value: 'mine', label: 'My Tasks',  count: null },
              ].map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="relative px-4 py-3 rounded-none border-b-2 border-transparent text-sm font-medium
                             text-muted-foreground bg-transparent hover:text-foreground
                             data-[state=active]:border-primary data-[state=active]:text-primary
                             data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className="ml-2 bg-border text-muted-foreground text-xs px-1.5 py-0.5 rounded-full font-semibold">
                      {tab.count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="all"  className="mt-0">
            <TaskTable items={tasks} loading={loading} onEdit={openEdit} onDelete={deleteTask} onComplete={markComplete} />
          </TabsContent>
          <TabsContent value="mine" className="mt-0">
            <TaskTable items={tasks} loading={loading} onEdit={openEdit} onDelete={deleteTask} onComplete={markComplete} />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Create / Edit Dialog ── */}
      <Dialog open={showCreate} onOpenChange={o => { if (!o) { setShowCreate(false); setEditTask(null); resetForm() } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto !rounded-[16px] !p-0 gap-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
            <div className="erp-icon-box-md flex-shrink-0">
              <ClipboardTaskListLtrRegular className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground m-0 p-0">
                {editTask ? 'Edit Task' : 'Create New Task'}
              </DialogTitle>
              <p className="text-xs text-brand-muted-light mt-0.5">
                {editTask ? 'Update the task details below' : 'Fill in the details to create a task'}
              </p>
            </div>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="erp-label erp-label-req">Task Title</label>
                <input
                  placeholder="Enter a clear, descriptive title…"
                  className="erp-field"
                  {...register('title', { required: true })}
                />
              </div>

              <div>
                <label className="erp-label">Description</label>
                <textarea
                  rows={3}
                  placeholder="Optional instructions or context…"
                  className="erp-field !h-auto py-3 resize-none"
                  {...register('description')}
                />
              </div>

              <div>
                <label className="erp-label erp-label-req">Assign To</label>
                <Controller control={control} name="assignedTo" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="erp-field !h-12 !rounded-[10px] [&>span]:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary">
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="erp-label erp-label-req">Due Date</label>
                  <input type="date" className="erp-field" {...register('dueDate', { required: true })} />
                </div>
                <div>
                  <label className="erp-label">Priority</label>
                  <Controller control={control} name="priority" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="erp-field !h-12 !rounded-[10px] [&>span]:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => (
                          <SelectItem key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>

              {editTask && (
                <div>
                  <label className="erp-label">Status</label>
                  <Controller control={control} name="status" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="erp-field !h-12 !rounded-[10px] [&>span]:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => (
                          <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              )}

              <div className="rounded-[10px] border border-border p-4 bg-muted/50">
                <WhatsAppReminderToggle
                  value={waReminder}
                  reminderTime={reminderTime}
                  onToggle={setWaReminder}
                  onTimeChange={setReminderTime}
                  assigneeWhatsApp={selectedAssigneeWa}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-border bg-muted/50 rounded-b-[16px]">
              <button
                type="button"
                onClick={() => { setShowCreate(false); resetForm() }}
                className="erp-btn erp-btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="erp-btn erp-btn-primary">
                {isSubmitting ? (
                  <><div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                ) : (
                  editTask ? 'Update Task' : 'Create Task'
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
