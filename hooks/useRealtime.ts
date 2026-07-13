import { useEffect, useCallback, useRef, useState } from 'react'
import {
  subscribeToTable,
  subscribeToFinancialUpdates,
  subscribeToHRUpdates,
  subscribeToOperationsUpdates,
  unsubscribeFromTable,
  realtimeEventBus,
  RealtimeChange,
  ChangeCallback,
  RealtimeChannel,
} from '@/lib/realtime'

/**
 * Hook to subscribe to real-time changes on a specific table
 * @param tableName - Name of the table to subscribe to
 * @param companyId - Company ID to filter by
 * @param callback - Function to call when changes occur
 */
export function useRealtimeTable(
  tableName: string,
  companyId: string | undefined,
  callback: ChangeCallback
) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!companyId) return

    const subscribe = async () => {
      channelRef.current = await subscribeToTable(tableName, companyId, callback)
    }

    subscribe()

    return () => {
      if (channelRef.current) {
        unsubscribeFromTable(channelRef.current)
      }
    }
  }, [tableName, companyId, callback])
}

/**
 * Hook to subscribe to all financial table changes
 */
export function useRealtimeFinancial(
  companyId: string | undefined,
  callback: ChangeCallback
) {
  const channelsRef = useRef<RealtimeChannel[]>([])

  useEffect(() => {
    if (!companyId) return

    const subscribe = async () => {
      channelsRef.current = await subscribeToFinancialUpdates(companyId, callback)
    }

    subscribe()

    return () => {
      channelsRef.current.forEach(channel => unsubscribeFromTable(channel))
    }
  }, [companyId, callback])
}

/**
 * Hook to subscribe to all HR table changes
 */
export function useRealtimeHR(
  companyId: string | undefined,
  callback: ChangeCallback
) {
  const channelsRef = useRef<RealtimeChannel[]>([])

  useEffect(() => {
    if (!companyId) return

    const subscribe = async () => {
      channelsRef.current = await subscribeToHRUpdates(companyId, callback)
    }

    subscribe()

    return () => {
      channelsRef.current.forEach(channel => unsubscribeFromTable(channel))
    }
  }, [companyId, callback])
}

/**
 * Hook to subscribe to all operations table changes
 */
export function useRealtimeOperations(
  companyId: string | undefined,
  callback: ChangeCallback
) {
  const channelsRef = useRef<RealtimeChannel[]>([])

  useEffect(() => {
    if (!companyId) return

    const subscribe = async () => {
      channelsRef.current = await subscribeToOperationsUpdates(companyId, callback)
    }

    subscribe()

    return () => {
      channelsRef.current.forEach(channel => unsubscribeFromTable(channel))
    }
  }, [companyId, callback])
}

/**
 * Hook to listen for global event bus events
 * @param eventKey - Event key to listen for (e.g., 'financial-changes', 'invoices-changes')
 */
export function useRealtimeEvent(
  eventKey: string,
  callback: ChangeCallback
) {
  useEffect(() => {
    const unsubscribe = realtimeEventBus.subscribe(eventKey, callback)
    return unsubscribe
  }, [eventKey, callback])
}

/**
 * Hook to listen for specific table changes via event bus
 * @param tableName - Table name to listen for
 */
export function useRealtimeTableEvents(
  tableName: string,
  callback: ChangeCallback
) {
  useRealtimeEvent(`${tableName}-changes`, callback)
}

/**
 * Hook to get real-time notifications
 * Returns notifications state and methods to manage them
 */
export function useRealtimeNotifications(companyId: string | undefined) {
  const [notifications, setNotifications] = useState<RealtimeChange[]>([])

  const addNotification = useCallback((change: RealtimeChange) => {
    setNotifications(prev => [change, ...prev].slice(0, 50)) // Keep last 50
  }, [])

  const clearNotification = useCallback((index: number) => {
    setNotifications(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  // Subscribe to financial changes
  useRealtimeFinancial(companyId, (change) => {
    if (change.type !== 'UPDATE' || change.table === 'bankAccount') {
      addNotification(change)
    }
  })

  return {
    notifications,
    addNotification,
    clearNotification,
    clearAllNotifications,
  }
}

/**
 * Hook to track real-time balance updates
 * @param tableName - 'customer' or 'supplier'
 * @param recordId - ID of the customer or supplier
 */
export function useRealtimeBalance(
  tableName: 'customer' | 'supplier',
  recordId: string | undefined,
  companyId: string | undefined
) {
  const [balance, setBalance] = useState<number | null>(null)

  useRealtimeTable(tableName, companyId, (change) => {
    if (change.record.id === recordId) {
      setBalance(change.record.current_balance ?? change.record.currentBalance)
    }
  })

  return balance
}

/**
 * Hook to track invoice status changes in real-time
 */
export function useRealtimeInvoiceStatus(
  invoiceId: string | undefined,
  companyId: string | undefined
) {
  const [status, setStatus] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useRealtimeTable('salesInvoice', companyId, (change) => {
    if (change.record.id === invoiceId || change.record.invoice_id === invoiceId) {
      setStatus(change.record.status)
      setLastUpdate(new Date())
    }
  })

  useRealtimeTable('purchaseInvoice', companyId, (change) => {
    if (change.record.id === invoiceId) {
      setStatus(change.record.status)
      setLastUpdate(new Date())
    }
  })

  return { status, lastUpdate }
}

/**
 * Hook to track payment status in real-time
 */
export function useRealtimePaymentStatus(
  paymentId: string | undefined,
  companyId: string | undefined
) {
  const [status, setStatus] = useState<string | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useRealtimeTable('payment', companyId, (change) => {
    if (change.record.id === paymentId) {
      setStatus(change.record.status)
      setAmount(change.record.amount)
      setLastUpdate(new Date())
    }
  })

  return { status, amount, lastUpdate }
}

/**
 * Hook to get real-time count of records (e.g., pending invoices)
 */
export function useRealtimeCount(
  tableName: string,
  companyId: string | undefined,
  filterFn?: (record: any) => boolean
) {
  const [count, setCount] = useState<number>(0)
  const recordsRef = useRef<Map<string, any>>(new Map())

  useRealtimeTable(tableName, companyId, (change) => {
    const records = recordsRef.current

    if (change.type === 'INSERT') {
      if (!filterFn || filterFn(change.record)) {
        records.set(change.record.id, change.record)
      }
    } else if (change.type === 'UPDATE') {
      const oldRecord = records.get(change.record.id)
      const matchesFilter = filterFn ? filterFn(change.record) : true
      const matchedBefore = oldRecord && (!filterFn || filterFn(oldRecord))

      if (matchesFilter && !matchedBefore) {
        records.set(change.record.id, change.record)
      } else if (!matchesFilter && matchedBefore) {
        records.delete(change.record.id)
      } else if (matchesFilter) {
        records.set(change.record.id, change.record)
      }
    } else if (change.type === 'DELETE') {
      records.delete(change.record.id)
    }

    setCount(records.size)
  })

  return count
}
