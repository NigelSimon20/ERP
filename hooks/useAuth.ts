'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  department?: string | null
  phone?: string | null
  whatsapp?: string | null
  avatar?: string | null
  active: boolean
  mustChangePassword: boolean
  lastLogin?: string | null
  companyId: string
  company?: {
    id: string
    name: string
    currency: string
    logo?: string | null
  } | null
}

export interface UseAuthResult {
  user: AuthUser | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * useAuth - Returns the currently authenticated user's full profile.
 * Fetches from /api/auth/me on mount and whenever refresh() is called.
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/me')
      if (res.status === 401) {
        setUser(null)
        setError('unauthenticated')
        return
      }
      if (!res.ok) throw new Error('Failed to load user')
      const data = await res.json()
      setUser(data.user ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { user, loading, error, refresh }
}
