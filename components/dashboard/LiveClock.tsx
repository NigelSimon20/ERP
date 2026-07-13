'use client'

import React from 'react'
import { useClock } from '@/hooks/useClock'
import { FiClock } from 'react-icons/fi'

interface LiveClockProps {
  showIcon?: boolean
  showDate?: boolean
  compact?: boolean
}

/**
 * LiveClock - Displays live updating time and date
 * Updates every second for real-time display
 * 
 * @param {LiveClockProps} props
 * @param {boolean} [props.showIcon=true] - Whether to show clock icon
 * @param {boolean} [props.showDate=true] - Whether to show date
 * @param {boolean} [props.compact=false] - Compact layout without full date
 * 
 * @example
 * // Full display with date
 * <LiveClock showIcon={true} showDate={true} />
 * 
 * @example
 * // Compact time-only display
 * <LiveClock compact={true} />
 */
export function LiveClock({
  showIcon = true,
  showDate = true,
  compact = false
}: LiveClockProps) {
  const { timeString, dateString, dateShort } = useClock()

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm font-mono text-gray-700">
        {showIcon && <FiClock className="w-4 h-4 text-blue-600" />}
        <span className="tracking-wider">{timeString}</span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      {showIcon && (
        <div className="flex-shrink-0 mt-1">
          <FiClock className="w-5 h-5 text-blue-600" />
        </div>
      )}
      
      <div className="flex-1 space-y-1">
        <div className="font-mono text-xl font-semibold text-gray-900 tracking-wider">
          {timeString}
        </div>
        
        {showDate && (
          <div className="text-sm text-gray-600">
            {dateString}
          </div>
        )}
      </div>
    </div>
  )
}

export type { LiveClockProps }


