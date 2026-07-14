'use client'

import React from 'react'
import { useGreeting } from '@/hooks/useGreeting'
import { useClock } from '@/hooks/useClock'
import { CalendarLtrRegular, ClockRegular, CloudRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons';
interface DashboardClockWidgetProps {
  title?: string
  showGreeting?: boolean
  userName?: string
}

/**
 * DashboardClockWidget - Standalone widget for displaying time and greeting
 * Can be placed on dashboard or any page as a widget/card
 * 
 * @param {DashboardClockWidgetProps} props
 * @param {string} [props.title] - Widget title
 * @param {boolean} [props.showGreeting=true] - Show greeting message
 * @param {string} [props.userName] - User name for greeting
 * 
 * @example
 * <DashboardClockWidget title="Current Time" userName="John" />
 */
export function DashboardClockWidget({
  title = 'Current Time',
  showGreeting = true,
  userName
}: DashboardClockWidgetProps) {
  const { phrase, subMessage, phase } = useGreeting()
  const { timeString, dateString } = useClock()

  const phaseIcons: Record<string, React.ReactNode> = {
    morning: <WeatherSunnyRegular className="w-8 h-8 text-primary" />,
    afternoon: <CloudRegular className="w-8 h-8 text-muted-foreground" />,
    evening: <CloudRegular className="w-8 h-8 text-muted-foreground" />,
    night: <WeatherMoonRegular className="w-8 h-8 text-muted-foreground" />
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm p-6">
      {/* Title */}
      {title && (
        <div className="flex items-center gap-2 mb-4">
          <ClockRegular className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-4">
        {/* Time Display */}
        <div className="text-center">
          <div className="text-5xl font-mono font-bold text-foreground tracking-wider">
            {timeString}
          </div>
          
          <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
            <CalendarLtrRegular className="w-4 h-4" />
            <span>{dateString}</span>
          </div>
        </div>

        {/* Greeting Section */}
        {showGreeting && (
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            {phaseIcons[phase]}
            
            <div className="flex-1">
              <div className="font-semibold text-foreground text-sm">
                {phrase}
                {userName && <span className="text-primary ml-1">{userName}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {subMessage}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * CompactClockWidget - Minimal clock widget for tight spaces
 * Shows time and date in compact format
 * 
 * @example
 * <CompactClockWidget />
 */
export function CompactClockWidget() {
  const { timeString, dateShort } = useClock()

  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-1 border border-border">
      <div className="text-center">
        <div className="text-2xl font-mono font-bold text-foreground">
          {timeString}
        </div>
        <div className="text-xs text-muted-foreground">
          {dateShort}
        </div>
      </div>
    </div>
  )
}

export type { DashboardClockWidgetProps }


