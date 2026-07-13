'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface Notification {
  id: string
  title: string
  message: string
  type: string
  read: boolean
  link?: string | null
  createdAt: string
}

export interface UseNotificationsResult {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  markAsRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  refresh: () => Promise<void>
}

const POLL_INTERVAL_MS = 30_000

/**
 * useNotifications - Polls /api/notifications every 30 seconds.
 * Provides individual and bulk mark-as-read actions.
 * Safe to use in multiple components — each call creates its own interval.
 */
export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const isMounted = useRef(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=20')
      if (res.ok && isMounted.current) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setUnreadCount(data.unreadCount ?? 0)
      }
    } catch {
      // silent — network errors should not crash the component
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      isMounted.current = false
      clearInterval(interval)
    }
  }, [refresh])

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await fetch(`/api/notifications?action=markRead&id=${encodeURIComponent(id)}`, { method: 'PATCH' })
    } catch {
      // revert on failure
      refresh()
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      await fetch('/api/notifications', { method: 'PATCH' })
    } catch {
      refresh()
    }
  }, [refresh])

  return { notifications, unreadCount, loading, markAsRead, markAllRead, refresh }
}
