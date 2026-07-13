'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FaBell, FaCheckDouble, FaHistory, FaExternalLinkAlt } from 'react-icons/fa'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { timeAgo } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  TASK:        'bg-[#DBEAFE] text-[#1D4ED8]',
  INCIDENT:    'bg-[#FEE2E2] text-[#DC2626]',
  LEAVE:       'bg-[#D1FAE5] text-[#059669]',
  ATTENDANCE:  'bg-[#FEF3C7] text-[#D97706]',
  PATROL:      'bg-[#EDE9FE] text-[#7C3AED]',
  VISITOR:     'bg-[#E0F2FE] text-[#0284C7]',
  PAYROLL:     'bg-[#DCFCE7] text-[#16A34A]',
  SYSTEM:      'bg-[#F3F4F6] text-[#374151]',
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
          className="relative p-2 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827] transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <FaBell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 w-4 bg-[#E74C5B] text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0 shadow-xl border-[#E5E7EB] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] bg-white">
          <div className="flex items-center gap-2">
            <FaBell className="h-4 w-4 text-[#E74C5B]" />
            <p className="font-semibold text-sm text-[#111827]">Notifications</p>
            {unreadCount > 0 && (
              <span className="h-5 px-1.5 bg-[#E74C5B] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#E74C5B] animate-pulse" title="Refreshing..." />
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-[#E74C5B] hover:text-[#D63F4F] font-medium transition-colors"
                title="Mark all as read"
              >
                <FaCheckDouble className="h-3 w-3" />
                All read
              </button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[380px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="h-12 w-12 rounded-2xl bg-[#F3F4F6] flex items-center justify-center">
                <FaBell className="h-5 w-5 text-[#9CA3AF]" />
              </div>
              <p className="text-sm text-[#9CA3AF] font-medium">No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-[#F3F4F6] last:border-0 hover:bg-[#F9FAFB] transition-colors cursor-pointer',
                  !n.read && 'bg-[#FFF8F8]'
                )}
                onClick={() => handleNotificationClick(n.id, n.link, n.read)}
              >
                <div className="flex items-start gap-3">
                  <span className={cn('flex-shrink-0 mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide', typeClass(n.type))}>
                    {n.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={cn('text-sm font-medium leading-tight', !n.read ? 'text-[#111827]' : 'text-[#374151]')}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!n.read && <span className="h-2 w-2 rounded-full bg-[#E74C5B] flex-shrink-0" />}
                        {n.link && <FaExternalLinkAlt className="h-2.5 w-2.5 text-[#9CA3AF]" />}
                      </div>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-[#9CA3AF] mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#E5E7EB] px-4 py-2.5 bg-[#F9FAFB] flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push('/notifications') }}
            className="flex items-center gap-1.5 text-xs text-[#E74C5B] hover:text-[#D63F4F] font-semibold transition-colors"
          >
            <FaHistory className="h-3 w-3" />
            View all notifications
          </button>
          <span className="text-[10px] text-[#9CA3AF]">Auto-refreshes every 30s</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
