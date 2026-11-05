import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
// Re-export Supabase RealtimeChannel type for consumers
export type { RealtimeChannel }
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Created on first use: createClient throws without a URL, which would crash
// `next build` and every page importing this module when the env is missing.
let client: SupabaseClient | undefined
function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Realtime is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing)')
    client = createClient(url, key)
  }
  return client
}

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimeChange<T = any> {
  type: RealtimeEvent
  table: string
  record: T
  oldRecord?: T
  companyId?: string
}

// Subscription callbacks
export type ChangeCallback<T = any> = (change: RealtimeChange<T>) => void

// Real-time event emitter for cross-component communication
class RealtimeEventBus {
  private listeners: Map<string, Set<ChangeCallback>> = new Map()

  subscribe(key: string, callback: ChangeCallback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)?.add(callback)

    // Return unsubscribe function
    return () => {
      this.listeners.get(key)?.delete(callback)
    }
  }

  emit(key: string, change: RealtimeChange) {
    const callbacks = this.listeners.get(key)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(change)
        } catch (error) {
          console.error(`Error in realtime callback for ${key}:`, error)
        }
      })
    }
  }

  unsubscribeAll(key: string) {
    this.listeners.delete(key)
  }
}

export const realtimeEventBus = new RealtimeEventBus()

/**
 * Subscribe to changes on a specific table for a company
 * Works with Supabase Realtime PostgreSQL subscriptions
 */
// Tables with no companyId column of their own (e.g. attendance, scoped via
// guardId -> Guard.companyId) can't be filtered server-side by Realtime's
// simple column filter — they fall back to the client-side check below only.
const NO_COMPANY_ID_COLUMN = new Set(['attendance'])

export async function subscribeToTable(
  tableName: string,
  companyId: string,
  callback: ChangeCallback
) {
  const channel = supabase()
    .channel(`${tableName}-${companyId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName,
        ...(NO_COMPANY_ID_COLUMN.has(tableName) ? {} : { filter: `companyId=eq.${companyId}` }),
      },
      (payload: RealtimePostgresChangesPayload<any>) => {
        // Parse the change
        const change: RealtimeChange = {
          type: payload.eventType as RealtimeEvent,
          table: tableName,
          record: (payload.new as any) || (payload.old as any),
          oldRecord: payload.old as any,
          companyId: ((payload.new as any)?.companyId || (payload.old as any)?.companyId) as string,
        }

        // Only emit if it matches the company
        if (change.companyId === companyId || !change.companyId) {
          callback(change)
          // Also broadcast to event bus for global subscribers
          realtimeEventBus.emit(`${tableName}-changes`, change)
        }
      }
    )
    .subscribe()

  return channel
}

/**
 * Subscribe to financial table changes (invoices, payments, customers, suppliers)
 */
export async function subscribeToFinancialUpdates(
  companyId: string,
  callback: ChangeCallback
) {
  const tables = [
    'sales_invoices',
    'purchase_invoices',
    'payments',
    'customers',
    'suppliers',
    'bank_accounts',
  ]

  const channels = await Promise.all(
    tables.map(table =>
      subscribeToTable(table, companyId, (change) => {
        // Emit financial-specific event
        realtimeEventBus.emit('financial-changes', change)
        callback(change)
      })
    )
  )

  return channels
}

/**
 * Subscribe to HR updates (payroll, attendance, leave requests)
 */
export async function subscribeToHRUpdates(
  companyId: string,
  callback: ChangeCallback
) {
  const tables = ['payroll_runs', 'attendance', 'leave_requests']

  const channels = await Promise.all(
    tables.map(table =>
      subscribeToTable(table, companyId, (change) => {
        realtimeEventBus.emit('hr-changes', change)
        callback(change)
      })
    )
  )

  return channels
}

/**
 * Subscribe to operations updates (deployments, sites, equipment)
 */
export async function subscribeToOperationsUpdates(
  companyId: string,
  callback: ChangeCallback
) {
  const tables = ['deployments', 'sites', 'equipment']

  const channels = await Promise.all(
    tables.map(table =>
      subscribeToTable(table, companyId, (change) => {
        realtimeEventBus.emit('operations-changes', change)
        callback(change)
      })
    )
  )

  return channels
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribeFromTable(channel: RealtimeChannel) {
  await supabase().removeChannel(channel)
}

/**
 * Broadcast a custom event to all connected clients
 * (Used for notifications, alerts, etc.)
 */
export async function broadcastEvent(
  channelName: string,
  eventType: string,
  data: any
) {
  const channel = supabase().channel(channelName)
  await channel.send({
    type: 'broadcast',
    event: eventType,
    payload: data,
  })
}

/**
 * Listen for custom broadcast events
 */
export function listenForBroadcast(
  channelName: string,
  eventType: string,
  callback: (data: any) => void
) {
  const channel = supabase()
    .channel(channelName)
    .on('broadcast', { event: eventType }, (payload) => {
      callback(payload.payload)
    })
    .subscribe()

  return channel
}

/**
 * Track user presence (who's online)
 */
export async function trackPresence(
  companyId: string,
  userId: string,
  userInfo: { name: string; email: string; avatar?: string }
) {
  const channel = supabase().channel(`presence-${companyId}`, {
    config: {
      presence: {
        key: userId,
      },
    },
  })

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      console.log('Presence updated:', state)
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('User joined:', key, newPresences)
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('User left:', key, leftPresences)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          ...userInfo,
          online_at: new Date().toISOString(),
        })
      }
    })

  return channel
}

/**
 * Get current online users in a company
 */
export function getOnlineUsers(companyId: string) {
  const channel = supabase().channel(`presence-${companyId}`, {
    config: {
      presence: {
        key: 'user',
      },
    },
  })

  return channel.presenceState()
}
