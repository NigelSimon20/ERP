'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

export interface DashboardDateRange {
  from: Date
  to: Date
}

interface DashboardFilterValue {
  siteId: string | null
  setSiteId: (id: string | null) => void
  dateRange: DashboardDateRange
  setDateRange: (range: DashboardDateRange) => void
}

const DashboardFilterContext = createContext<DashboardFilterValue | null>(null)

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [siteId, setSiteId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DashboardDateRange>(() => {
    const today = new Date()
    return { from: today, to: today }
  })

  return (
    <DashboardFilterContext.Provider value={{ siteId, setSiteId, dateRange, setDateRange }}>
      {children}
    </DashboardFilterContext.Provider>
  )
}

export function useDashboardFilter() {
  const ctx = useContext(DashboardFilterContext)
  if (!ctx) throw new Error('useDashboardFilter must be used within a DashboardFilterProvider')
  return ctx
}
