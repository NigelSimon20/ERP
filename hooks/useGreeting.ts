'use client'

import { useState, useEffect } from 'react'

type TimePhase = 'morning' | 'afternoon' | 'evening' | 'night'

interface GreetingResult {
  phrase: string
  subMessage: string
  phase: TimePhase
}

const PHASE_CONFIG: Record<TimePhase, { phrase: string; subMessage: string }> = {
  morning: {
    phrase: 'Good morning',
    subMessage: 'Ready to start the day?'
  },
  afternoon: {
    phrase: 'Good afternoon',
    subMessage: 'Keep up the great work.'
  },
  evening: {
    phrase: 'Good evening',
    subMessage: 'Wrapping up for the day?'
  },
  night: {
    phrase: 'Good night',
    subMessage: 'Working late? Stay focused.'
  }
}

function getPhase(hour: number): TimePhase {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

/**
 * useGreeting - Custom hook that returns time-based greeting
 * Updates every minute to check if the time phase has changed
 * 
 * @returns {GreetingResult} Object containing phrase, subMessage, and phase
 * 
 * @example
 * const { phrase, subMessage, phase } = useGreeting()
 * // phrase: "Good morning"
 * // subMessage: "Ready to start the day?"
 * // phase: "morning"
 */
export function useGreeting(): GreetingResult {
  // Fixed initial value so SSR and first client render agree (server hour is
  // UTC, client hour is local); the real phase is applied after mount.
  const [phase, setPhase] = useState<TimePhase>('morning')

  useEffect(() => {
    setPhase(getPhase(new Date().getHours()))
    // Check every minute if the time phase has changed
    const interval = setInterval(() => {
      const newPhase = getPhase(new Date().getHours())
      setPhase(prev => prev !== newPhase ? newPhase : prev)
    }, 60_000)

    return () => clearInterval(interval)
  }, [])

  return {
    phrase: PHASE_CONFIG[phase].phrase,
    subMessage: PHASE_CONFIG[phase].subMessage,
    phase
  }
}

export type { TimePhase, GreetingResult }
