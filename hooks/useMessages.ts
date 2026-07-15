'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { subscribeToTable, unsubscribeFromTable, type RealtimeChannel } from '@/lib/realtime'

export interface MessageThread {
  userId: string
  name: string
  role: string
  lastMessage: string
  lastMessageAt: string
  lastMessageFromMe: boolean
  unreadCount: number
}

const POLL_INTERVAL_MS = 8_000

// Polls /api/messages/threads for near-real-time updates (guaranteed to
// work), and layers a Supabase Realtime subscription on top for instant
// pushes when a new message row lands — if Realtime isn't available for
// any reason, polling alone still keeps this live.
export function useMessages(companyId?: string) {
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const isMounted = useRef(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/messages/threads')
      if (res.ok && isMounted.current) {
        const data = await res.json()
        setThreads(data.threads ?? [])
        setTotalUnread(data.totalUnread ?? 0)
      }
    } catch {
      // network errors should not crash the component
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

  useEffect(() => {
    if (!companyId) return
    let channel: RealtimeChannel | undefined
    let cancelled = false

    subscribeToTable('messages', companyId, () => {
      if (!cancelled) refresh()
    }).then((c) => {
      if (cancelled) unsubscribeFromTable(c)
      else channel = c
    }).catch(() => {
      // Realtime unavailable — polling above still covers us.
    })

    return () => {
      cancelled = true
      if (channel) unsubscribeFromTable(channel)
    }
  }, [companyId, refresh])

  return { threads, totalUnread, loading, refresh }
}
