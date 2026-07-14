'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { useNotifications } from '@/hooks/useNotifications'
import { cn, timeAgo } from '@/lib/utils'
import { AlertRegular, CheckmarkStarburstRegular, FilterRegular, OpenRegular } from '@fluentui/react-icons';

const ALL_TYPES = ['ALL', 'TASK', 'INCIDENT', 'LEAVE', 'ATTENDANCE', 'PATROL', 'VISITOR', 'PAYROLL', 'SYSTEM']

const TYPE_COLORS: Record<string, string> = {
  TASK:        'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  INCIDENT:    'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  LEAVE:       'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  ATTENDANCE:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PATROL:      'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white',
  VISITOR:     'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  PAYROLL:     'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  SYSTEM:      'bg-border text-foreground',
}

export default function NotificationsPage() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications()
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')

  const filtered = notifications.filter((n) => {
    const matchType = typeFilter === 'ALL' || n.type?.toUpperCase() === typeFilter
    const matchRead =
      readFilter === 'all' ||
      (readFilter === 'unread' && !n.read) ||
      (readFilter === 'read' && n.read)
    return matchType && matchRead
  })

  async function handleClick(id: string, link?: string | null, read?: boolean) {
    if (!read) await markAsRead(id)
    if (link) router.push(link)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        description="Your activity feed and system alerts"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]}
        action={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="erp-btn erp-btn-secondary erp-btn-sm flex items-center gap-1.5"
            >
              <CheckmarkStarburstRegular className="h-3.5 w-3.5" />
              Mark all read ({unreadCount})
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterRegular className="h-3.5 w-3.5 text-brand-muted-light" />
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold transition-colors border',
              typeFilter === t
                ? 'bg-primary text-white border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary'
            )}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {(['all', 'unread', 'read'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReadFilter(r)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border capitalize',
                readFilter === r
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-card text-muted-foreground border-border hover:bg-border'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="mt-4 erp-card overflow-hidden p-0">
        {loading && notifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-brand-muted-light">Loading notifications…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-border flex items-center justify-center">
              <AlertRegular className="h-6 w-6 text-brand-muted-light" />
            </div>
            <p className="text-sm font-semibold text-foreground">No notifications</p>
            <p className="text-xs text-brand-muted-light">Try adjusting the filters above</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn(
                  'w-full text-left px-5 py-4 hover:bg-muted/50 transition-colors',
                  !n.read && 'bg-primary/5'
                )}
                onClick={() => handleClick(n.id, n.link, n.read)}
              >
                <div className="flex items-start gap-4">
                  {/* Unread indicator */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!n.read
                      ? <span className="h-2.5 w-2.5 rounded-full bg-primary block" />
                      : <span className="h-2.5 w-2.5 rounded-full bg-transparent block" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide',
                        TYPE_COLORS[n.type?.toUpperCase()] ?? TYPE_COLORS.SYSTEM
                      )}>
                        {n.type}
                      </span>
                      <span className="text-[10px] text-brand-muted-light">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className={cn(
                      'text-sm font-semibold leading-snug',
                      'text-foreground'
                    )}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </div>

                  {n.link && <OpenRegular className="h-3 w-3 text-brand-muted-light flex-shrink-0 mt-1.5" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <p className="text-center text-xs text-brand-muted-light mt-4">
          Showing {filtered.length} of {notifications.length} notifications · Auto-refreshes every 30s
        </p>
      )}
    </div>
  )
}
