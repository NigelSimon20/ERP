'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { subscribeToTable, unsubscribeFromTable, type RealtimeChannel } from '@/lib/realtime'

export interface ThreadMessage {
  id: string
  senderId: string
  recipientId: string
  body: string
  read: boolean
  createdAt: string
}

export interface ThreadCounterpart {
  id: string
  name: string
  role: string
  online: boolean
}

const POLL_INTERVAL_MS = 4_000

export function useThreadMessages(userId: string | null, companyId?: string) {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [counterpart, setCounterpart] = useState<ThreadCounterpart | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const isMounted = useRef(true)

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/messages/thread/${encodeURIComponent(userId)}`)
      if (res.ok && isMounted.current) {
        const data = await res.json()
        setMessages(data.messages ?? [])
        setCounterpart(data.counterpart ?? null)
      }
    } catch {
      // network errors should not crash the component
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    isMounted.current = true
    setMessages([])
    setCounterpart(null)
    if (!userId) return
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      isMounted.current = false
      clearInterval(interval)
    }
  }, [userId, refresh])

  useEffect(() => {
    if (!companyId || !userId) return
    let channel: RealtimeChannel | undefined
    let cancelled = false

    subscribeToTable('messages', companyId, () => {
      if (!cancelled) refresh()
    }).then((c) => {
      if (cancelled) unsubscribeFromTable(c)
      else channel = c
    }).catch(() => {})

    return () => {
      cancelled = true
      if (channel) unsubscribeFromTable(channel)
    }
  }, [companyId, userId, refresh])

  const send = useCallback(async (body: string) => {
    if (!userId || !body.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: userId, body }),
      })
      if (res.ok) await refresh()
      return res.ok
    } finally {
      setSending(false)
    }
  }, [userId, refresh])

  return { messages, counterpart, loading, sending, send, refresh }
}
