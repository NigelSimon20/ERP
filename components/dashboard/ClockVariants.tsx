'use client'

import React from 'react'
import { useClock } from '@/hooks/useClock'
import { FiClock, FiCalendar } from 'react-icons/fi'

interface TopNavigationClockProps {
  showDate?: boolean
  className?: string
}

/**
 * TopNavigationClock - Compact clock for top navigation/header bar
 * Displays time in minimal format suitable for header areas
 * 
 * @param {TopNavigationClockProps} props
 * @param {boolean} [props.showDate=false] - Show date below time
 * @param {string} [props.className] - Additional CSS classes
 * 
 * @example
 * <TopNavigationClock showDate={false} />
 */
export function TopNavigationClock({
  showDate = false,
  className = ''
}: TopNavigationClockProps) {
  const { timeString, dateShort } = useClock()

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <FiClock className="w-4 h-4 text-gray-600" />
      <div className="flex flex-col items-start text-xs">
        <span className="font-mono font-semibold text-gray-900">
          {timeString}
        </span>
        {showDate && (
          <span className="text-gray-500 text-xs">
            {dateShort}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * StatusBarClock - Ultra-compact clock for status bars
 * Single line display with time only
 * 
 * @param {string} [className] - Additional CSS classes
 * 
 * @example
 * <StatusBarClock />
 */
export function StatusBarClock({ className = '' }: { className?: string }) {
  const { timeString } = useClock()

  return (
    <div className={`flex items-center gap-1 text-xs font-mono text-gray-700 ${className}`}>
      <FiClock className="w-3 h-3" />
      <span>{timeString}</span>
    </div>
  )
}

/**
 * InlineGreetingClock - Greeting with inline clock for sidebars/panels
 * Compact format suitable for sidebar or side panel display
 * 
 * @param {string} [userName] - User name
 * @param {string} [className] - Additional CSS classes
 * 
 * @example
 * <InlineGreetingClock userName="John" />
 */
export function InlineGreetingClock({
  userName,
  className = ''
}: {
  userName?: string
  className?: string
}) {
  const { timeString, dateShort } = useClock()
  const { phrase } = useGreeting()

  return (
    <div className={`space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
      <div className="text-sm font-semibold text-gray-900">
        {phrase}
        {userName && <span className="text-premium-primary ml-1">{userName}</span>}
      </div>
      
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <FiClock className="w-3 h-3" />
        <span className="font-mono">{timeString}</span>
        <FiCalendar className="w-3 h-3 ml-2" />
        <span>{dateShort}</span>
      </div>
    </div>
  )
}

import { useGreeting } from '@/hooks/useGreeting'

export type { TopNavigationClockProps }


