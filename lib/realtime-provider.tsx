import React, { createContext, useContext, useCallback, useState, ReactNode } from 'react'
import { RealtimeChange, realtimeEventBus } from '@/lib/realtime'

interface RealtimeContextType {
  isConnected: boolean
  lastUpdate: Date | null
  notifications: RealtimeChange[]
  financialChanges: RealtimeChange[]
  hrChanges: RealtimeChange[]
  operationsChanges: RealtimeChange[]
  addNotification: (change: RealtimeChange) => void
  clearNotification: (index: number) => void
  clearAllNotifications: () => void
  getRecentChanges: (type: string, minutes: number) => RealtimeChange[]
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [isConnected] = useState(true) // Will be updated based on connection status
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [notifications, setNotifications] = useState<RealtimeChange[]>([])
  const [financialChanges, setFinancialChanges] = useState<RealtimeChange[]>([])
  const [hrChanges, setHRChanges] = useState<RealtimeChange[]>([])
  const [operationsChanges, setOperationsChanges] = useState<RealtimeChange[]>([])

  const addNotification = useCallback((change: RealtimeChange) => {
    setNotifications(prev => [change, ...prev].slice(0, 100))
    setLastUpdate(new Date())
  }, [])

  const clearNotification = useCallback((index: number) => {
    setNotifications(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const getRecentChanges = useCallback((type: string, minutes: number) => {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000)
    const allChanges = [...notifications, ...financialChanges, ...hrChanges, ...operationsChanges]

    return allChanges.filter(change => {
      if (type && !change.table.includes(type)) return false
      return true // In a real implementation, would filter by timestamp
    })
  }, [notifications, financialChanges, hrChanges, operationsChanges])

  // Listen to financial changes from event bus
  React.useEffect(() => {
    const unsubscribe = realtimeEventBus.subscribe('financial-changes', (change) => {
      setFinancialChanges(prev => [change, ...prev].slice(0, 100))
      addNotification(change)
    })
    return unsubscribe
  }, [addNotification])

  // Listen to HR changes from event bus
  React.useEffect(() => {
    const unsubscribe = realtimeEventBus.subscribe('hr-changes', (change) => {
      setHRChanges(prev => [change, ...prev].slice(0, 100))
    })
    return unsubscribe
  }, [])

  // Listen to operations changes from event bus
  React.useEffect(() => {
    const unsubscribe = realtimeEventBus.subscribe('operations-changes', (change) => {
      setOperationsChanges(prev => [change, ...prev].slice(0, 100))
    })
    return unsubscribe
  }, [])

  const value: RealtimeContextType = {
    isConnected,
    lastUpdate,
    notifications,
    financialChanges,
    hrChanges,
    operationsChanges,
    addNotification,
    clearNotification,
    clearAllNotifications,
    getRecentChanges,
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtimeContext() {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtimeContext must be used within RealtimeProvider')
  }
  return context
}
