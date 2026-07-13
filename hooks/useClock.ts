'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'

interface ClockResult {
  timeString: string    // e.g. "14:35:22"
  dateString: string    // e.g. "Saturday, 27 June 2026"
  dateShort: string     // e.g. "Sat, 27 Jun"
  now: Date             // The current date object for additional formatting if needed
}

/**
 * useClock - Custom hook that returns live updating time and date
 * Updates every second to keep time in sync
 * 
 * @returns {ClockResult} Object containing timeString, dateString, dateShort, and now
 * 
 * @example
 * const { timeString, dateString, dateShort } = useClock()
 * // timeString: "14:35:22"
 * // dateString: "Saturday, 27 June 2026"
 * // dateShort: "Sat, 27 Jun"
 */
export function useClock(): ClockResult {
  const [now, setNow] = useState<Date>(() => new Date(0))

  useEffect(() => {
    const updateClock = () => setNow(new Date())
    updateClock()

    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [])

  return {
    timeString: format(now, 'HH:mm:ss'),
    dateString: format(now, 'EEEE, d MMMM yyyy'),
    dateShort: format(now, 'EEE, d MMM'),
    now,
  }
}

export type { ClockResult }
