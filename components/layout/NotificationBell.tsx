'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { timeAgo } from '@/lib/utils'
import { AlertRegular, CheckmarkStarburstRegular, HistoryRegular, OpenRegular } from '@fluentui/react-icons';

const TYPE_COLORS: Record<string, string> = {
  TASK:        'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  INCIDENT:    'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  LEAVE:       'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  ATTENDANCE:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PATROL:      'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-white',
  VISITOR:     'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  PAYROLL:     'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  SYSTEM:      'bg-muted text-foreground',
}

export function NotificationBell() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)

  const handleNotificationClick = useCallback(
    async (id: string, link?: string | null, read?: boolean) => {
      if (!read) await markAsRead(id)
      if (link) {
        setOpen(false)
        router.push(link)
      }
    },
    [markAsRead, router]
  )

  const typeClass = (type: string) => TYPE_COLORS[type?.toUpperCase()] ?? TYPE_COLORS.SYSTEM

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-lg hover:bg-border text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <AlertRegular className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0 shadow-xl border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <AlertRegular className="h-4 w-4 text-primary" />
            <p className="font-semibold text-sm text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <span className="h-5 px-1.5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" title="Refreshing..." />
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-primary hover:text-brand-red-dark font-medium transition-colors"
                title="Mark all as read"
              >
                <CheckmarkStarburstRegular className="h-3 w-3" />
                All read
              </button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[380px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-12 w-12 rounded-2xl bg-border flex items-center justify-center">
                <AlertRegular className="h-5 w-5 text-brand-muted-light" />
              </div>
              <p className="text-sm text-brand-muted-light font-medium">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer',
                  !n.read && 'bg-primary/5'
                )}
                onClick={() => handleNotificationClick(n.id, n.link, n.read)}
              >
                <div className="flex items-start gap-3">
                  <span className={cn('flex-shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide', typeClass(n.type))}>
                    {n.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={cn('text-sm font-medium leading-tight text-foreground')}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!n.read && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                        {n.link && <OpenRegular className="h-2.5 w-2.5 text-brand-muted-light" />}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-brand-muted-light mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2.5 bg-muted/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/notifications') }}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-brand-red-dark font-semibold transition-colors"
          >
            <HistoryRegular className="h-3 w-3" />
            View all notifications
          </button>
          <span className="text-[10px] text-brand-muted-light">Auto-refreshes every 30s</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
