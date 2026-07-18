'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { isPastDue } from '@/lib/calculations'
import { ChatRegular, CheckmarkCircleRegular, ClockRegular, DeleteRegular, EditRegular, LocationRegular, MoreVerticalRegular, PersonRegular, WarningRegular } from '@fluentui/react-icons';

interface User { id: string; name: string; whatsapp: string | null }
interface Task {
  id: string; title: string; description: string | null; assignedTo: string;
  dueDate: string; priority: string; status: string; whatsappReminder: boolean;
  reminderTime: string | null; completedAt: string | null;
  assignedToUser: User | null; assignedByUser: User | null;
  site?: string
}

const PRIORITY_CFG: Record<string, { label: string; cls: string }> = {
  LOW:    { label: 'Low',    cls: 'erp-badge erp-badge-low'    },
  MEDIUM: { label: 'Medium', cls: 'erp-badge erp-badge-medium' },
  HIGH:   { label: 'High',   cls: 'erp-badge erp-badge-high'   },
  URGENT: { label: 'Urgent', cls: 'erp-badge erp-badge-urgent' },
}

const STATUS_CFG: Record<string, { label: string; cls: string; progress: number }> = {
  PENDING:     { label: 'Pending',     cls: 'erp-badge erp-badge-muted',   progress: 0   },
  IN_PROGRESS: { label: 'In Progress', cls: 'erp-badge erp-badge-info',    progress: 50  },
  COMPLETED:   { label: 'Completed',   cls: 'erp-badge erp-badge-success', progress: 100 },
  CANCELLED:   { label: 'Cancelled',   cls: 'erp-badge erp-badge-danger',  progress: 0   },
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function isOverdue(task: Task) {
  return task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && isPastDue(task.dueDate)
}

interface TaskCardProps {
  task: Task
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
  onComplete: (t: Task) => void
}

export function TaskCard({ task, onEdit, onDelete, onComplete }: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const overdue = isOverdue(task)
  const p = PRIORITY_CFG[task.priority]
  const s = STATUS_CFG[task.status]

  return (
    <div className={`erp-card relative flex flex-col gap-4 transition-all duration-200 ${overdue ? 'border-primary/30' : ''}`}>
      {/* Top row: icon + title + menu */}
      <div className="flex items-start gap-3">
        <div className="erp-icon-box-md flex-shrink-0 mt-0.5">
          <WarningRegular className={`h-4 w-4 ${overdue ? 'text-primary' : 'text-primary'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-sm leading-snug">{task.title}</p>
          {task.description && (
            <p className="text-xs text-brand-muted-light mt-1 leading-relaxed line-clamp-2">{task.description}</p>
          )}
        </div>
        {/* Three-dot menu */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-lg hover:bg-border text-brand-muted-light hover:text-foreground transition-colors"
            aria-label="Task actions"
          >
            <MoreVerticalRegular className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-10 bg-card border border-border rounded-xl shadow-dropdown w-40 py-1"
              onBlur={() => setMenuOpen(false)}
            >
              {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onComplete(task) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
                >
                  <CheckmarkCircleRegular className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> Mark Complete
                </button>
              )}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onEdit(task) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
              >
                <EditRegular className="h-3 w-3 text-muted-foreground" /> Edit Task
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(task) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors"
              >
                <DeleteRegular className="h-3 w-3" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Meta: assignee + site + date */}
      <div className="flex flex-col gap-2">
        {task.assignedToUser && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[9px] font-bold flex-shrink-0">
              {initials(task.assignedToUser.name)}
            </div>
            <span className="text-xs text-muted-foreground truncate">{task.assignedToUser.name}</span>
          </div>
        )}
        {task.site && (
          <div className="flex items-center gap-2">
            <LocationRegular className="h-3 w-3 text-brand-muted-light flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate">{task.site}</span>
          </div>
        )}
        <div className={`flex items-center gap-2 ${overdue ? 'text-primary' : 'text-brand-muted-light'}`}>
          <ClockRegular className="h-3 w-3 flex-shrink-0" />
          <span className={`text-xs ${overdue ? 'font-semibold' : ''}`}>{formatDate(task.dueDate)}</span>
          {overdue && <span className="text-[10px] font-bold uppercase tracking-wide">· Overdue</span>}
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={p?.cls ?? 'erp-badge erp-badge-muted'}>{p?.label ?? task.priority}</span>
        <span className={s?.cls ?? 'erp-badge erp-badge-muted'}>{s?.label ?? task.status.replace('_', ' ')}</span>
        {task.whatsappReminder && (
          <span className="erp-badge bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400">
            <ChatRegular className="h-3 w-3" /> WA
          </span>
        )}
      </div>

      {/* Progress bar */}
      {s && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-brand-muted-light uppercase tracking-wide">Progress</span>
            <span className="text-[10px] font-bold text-muted-foreground">{s.progress}%</span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
              className={`h-full rounded-full transition-all duration-500 ${
                s.progress === 100 ? 'bg-green-500' : s.progress > 0 ? 'bg-blue-500' : 'bg-border'
              } [--pct:0%]`}
              data-progress={s.progress}
              ref={el => { if (el) el.style.setProperty('width', `${s.progress}%`) }}
            />
          </div>
        </div>
      )}

      {/* Primary action */}
      {task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
        <button
          type="button"
          onClick={() => onComplete(task)}
          className="erp-btn erp-btn-secondary w-full erp-btn-sm justify-center"
        >
          <CheckmarkCircleRegular className="h-3.5 w-3.5" /> Mark Complete
        </button>
      )}
    </div>
  )
}
