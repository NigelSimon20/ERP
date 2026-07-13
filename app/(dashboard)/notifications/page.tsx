'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FaBell, FaCheckDouble, FaExternalLinkAlt, FaFilter } from 'react-icons/fa'
import { PageHeader } from '@/components/shared/PageHeader'
import { useNotifications } from '@/hooks/useNotifications'
import { cn, timeAgo } from '@/lib/utils'

const ALL_TYPES = ['ALL', 'TASK', 'INCIDENT', 'LEAVE', 'ATTENDANCE', 'PATROL', 'VISITOR', 'PAYROLL', 'SYSTEM']

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
              <FaCheckDouble className="h-3.5 w-3.5" />
              Mark all read ({unreadCount})
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FaFilter className="h-3.5 w-3.5 text-[#9CA3AF]" />
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold transition-colors border',
              typeFilter === t
                ? 'bg-[#E74C5B] text-white border-[#E74C5B]'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#E74C5B] hover:text-[#E74C5B]'
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
                  ? 'bg-[#374151] text-white border-[#374151]'
                  : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-[#F3F4F6]'
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
            <div className="h-8 w-8 border-2 border-[#E74C5B] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#9CA3AF]">Loading notifications…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-[#F3F4F6] flex items-center justify-center">
              <FaBell className="h-6 w-6 text-[#9CA3AF]" />
            </div>
            <p className="text-sm font-semibold text-[#374151]">No notifications</p>
            <p className="text-xs text-[#9CA3AF]">Try adjusting the filters above</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F3F4F6]">
            {filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn(
                  'w-full text-left px-5 py-4 hover:bg-[#F9FAFB] transition-colors',
                  !n.read && 'bg-[#FFF8F8]'
                )}
                onClick={() => handleClick(n.id, n.link, n.read)}
              >
                <div className="flex items-start gap-4">
                  {/* Unread indicator */}
                  <div className="mt-1.5 flex-shrink-0">
                    {!n.read
                      ? <span className="h-2.5 w-2.5 rounded-full bg-[#E74C5B] block" />
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
                      <span className="text-[10px] text-[#9CA3AF]">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className={cn(
                      'text-sm font-semibold leading-snug',
                      !n.read ? 'text-[#111827]' : 'text-[#374151]'
                    )}>
                      {n.title}
                    </p>
                    <p className="text-xs text-[#6B7280] mt-0.5">{n.message}</p>
                  </div>

                  {n.link && <FaExternalLinkAlt className="h-3 w-3 text-[#9CA3AF] flex-shrink-0 mt-1.5" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <p className="text-center text-xs text-[#9CA3AF] mt-4">
          Showing {filtered.length} of {notifications.length} notifications · Auto-refreshes every 30s
        </p>
      )}
    </div>
  )
}
