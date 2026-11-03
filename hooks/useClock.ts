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
  // null until mounted: any Date formatted during SSR renders in the server's
  // timezone (even new Date(0) -- "00:00:00" in UTC vs "02:00:00" in CAT), so
  // the TopBar clock caused a hydration mismatch (React #418/#423/#425) on
  // every page, forcing a full client re-render that swallowed early clicks.
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const updateClock = () => setNow(new Date())
    updateClock()

    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [])

  return {
    timeString: now ? format(now, 'HH:mm:ss') : '',
    dateString: now ? format(now, 'EEEE, d MMMM yyyy') : '',
    dateShort: now ? format(now, 'EEE, d MMM') : '',
    now: now ?? new Date(0),
  }
}

export type { ClockResult }
