'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, format,
} from 'date-fns'
import { ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDateTime, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface CalEvent { id: string; title: string; date: string; type: 'task' | 'meeting' | 'patrol' | 'deployment'; status?: string; location?: string; priority?: string }

const TYPE_STYLES = {
  task:       { dot: 'bg-primary',    badge: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300', label: 'Task' },
  meeting:    { dot: 'bg-brand-navy', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', label: 'Meeting' },
  patrol:     { dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', label: 'Patrol' },
  deployment: { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400', label: 'Deployment' },
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const from = calStart.toISOString()
    const to = calEnd.toISOString()

    try {
      const [tasksRes, meetingsRes] = await Promise.all([
        fetch(`/api/tasks/tasks?from=${from}&to=${to}`).then(r => r.json()),
        fetch(`/api/tasks/meetings?from=${from}&to=${to}`).then(r => r.json()),
      ])

      const taskEvents: CalEvent[] = (tasksRes.tasks ?? []).map((t: { id: string; title: string; dueDate: string; status: string; priority: string }) => ({
        id: t.id, title: t.title, date: t.dueDate, type: 'task' as const, status: t.status, priority: t.priority,
      }))
      const meetingEvents: CalEvent[] = (meetingsRes.meetings ?? []).map((m: { id: string; title: string; meetingDate: string; status: string; location: string }) => ({
        id: m.id, title: m.title, date: m.meetingDate, type: 'meeting' as const, status: m.status, location: m.location,
      }))

      // Also fetch patrols and deployments (fire-and-forget if endpoint missing)
      const patrolsData = await fetch(`/api/operations/patrols?from=${from}&to=${to}`).then(r => r.ok ? r.json() : { patrols: [] }).catch(() => ({ patrols: [] }))
      const deploymentsData = await fetch(`/api/operations/deployments?from=${from}&to=${to}`).then(r => r.ok ? r.json() : { deployments: [] }).catch(() => ({ deployments: [] }))

      const patrolEvents: CalEvent[] = (patrolsData.patrols ?? []).map((p: { id: string; title?: string; scheduledTime: string; status: string }) => ({
        id: p.id, title: p.title ?? 'Patrol', date: p.scheduledTime, type: 'patrol' as const, status: p.status,
      }))
      const deploymentEvents: CalEvent[] = (deploymentsData.deployments ?? []).map((d: { id: string; startDate: string; status: string; guard?: { name: string } }) => ({
        id: d.id, title: d.guard?.name ?? 'Deployment', date: d.startDate, type: 'deployment' as const, status: d.status,
      }))

      setEvents([...taskEvents, ...meetingEvents, ...patrolEvents, ...deploymentEvents])
    } catch {
      toast.error('Network error loading calendar events')
      setEvents([])
    } finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  function eventsOnDay(day: Date) {
    return events.filter(e => isSameDay(new Date(e.date), day))
  }

  const selectedDayEvents = selectedDay ? eventsOnDay(selectedDay) : []

  return (
    <div className="flex gap-4">
      {/* Calendar */}
      <div className="flex-1 min-w-0">
        <PageHeader title="Calendar" description="Unified view of tasks, meetings, patrols, and deployments" />

        {/* Month navigation */}
        <div className="mt-4 flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">{format(currentDate, 'MMMM yyyy')}</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Previous month"><ChevronLeftRegular className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">Today</button>
            <button type="button" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Next month"><ChevronRightRegular className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {Object.entries(TYPE_STYLES).map(([type, s]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
              {s.label}
            </div>
          ))}
          {loading && <div className="h-3 w-3 border border-border border-t-gray-600 rounded-full animate-spin ml-auto" />}
        </div>

        {/* Grid */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dayEvents = eventsOnDay(day)
              const isToday = isSameDay(day, new Date())
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date('invalid')) ? null : day)}
                  className={`min-h-[80px] p-2 text-left border-r border-b border-border last:border-r-0 hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}`}
                  aria-label={`${format(day, 'd MMMM yyyy')}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}` : ''}`}
                >
                  <span className={`text-xs font-medium inline-flex h-6 w-6 items-center justify-center rounded-full ${isToday ? 'bg-primary text-white' : isCurrentMonth ? 'text-foreground' : 'text-brand-muted-light'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map(e => (
                        <div key={e.id} className={`flex items-center gap-1 text-xs rounded px-1 py-0.5 truncate ${TYPE_STYLES[e.type]?.badge ?? 'bg-muted text-muted-foreground'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_STYLES[e.type]?.dot ?? 'bg-gray-400'}`} />
                          <span className="truncate">{e.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && <p className="text-xs text-brand-muted-light pl-1">+{dayEvents.length - 3} more</p>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day side panel */}
      {selectedDay && (
        <div className="w-72 shrink-0 rounded-lg border border-border bg-card h-fit sticky top-4">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-semibold text-foreground text-sm">{format(selectedDay, 'EEEE, d MMMM')}</p>
            <p className="text-xs text-brand-muted-light mt-0.5">{selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? 's' : ''}</p>
          </div>
          {selectedDayEvents.length === 0 ? (
            <p className="text-xs text-brand-muted-light text-center py-8">No events on this day</p>
          ) : (
            <div className="divide-y divide-border">
              {selectedDayEvents.map(e => (
                <button key={e.id} type="button" onClick={() => setSelectedEvent(e)} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${TYPE_STYLES[e.type]?.dot ?? 'bg-gray-400'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                      <p className="text-xs text-brand-muted-light mt-0.5">{TYPE_STYLES[e.type]?.label ?? e.type}</p>
                      {e.location && <p className="text-xs text-brand-muted-light truncate">{e.location}</p>}
                      {e.status && <p className="text-xs text-brand-muted-light">{e.status}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Event detail modal */}
      <Dialog open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
        <DialogContent className="max-w-sm">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${TYPE_STYLES[selectedEvent.type]?.dot ?? 'bg-gray-400'}`} />
                  {selectedEvent.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex gap-2"><span className="text-brand-muted-light w-16 shrink-0">Type</span><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[selectedEvent.type]?.badge ?? ''}`}>{TYPE_STYLES[selectedEvent.type]?.label ?? selectedEvent.type}</span></div>
                <div className="flex gap-2"><span className="text-brand-muted-light w-16 shrink-0">Date</span><span>{formatDate(new Date(selectedEvent.date))}</span></div>
                {selectedEvent.location && <div className="flex gap-2"><span className="text-brand-muted-light w-16 shrink-0">Location</span><span>{selectedEvent.location}</span></div>}
                {selectedEvent.status && <div className="flex gap-2"><span className="text-brand-muted-light w-16 shrink-0">Status</span><span>{selectedEvent.status}</span></div>}
                {selectedEvent.priority && <div className="flex gap-2"><span className="text-brand-muted-light w-16 shrink-0">Priority</span><span>{selectedEvent.priority}</span></div>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
