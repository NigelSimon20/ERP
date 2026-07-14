'use client'

import React from 'react'
import { useGreeting } from '@/hooks/useGreeting'
import { useClock } from '@/hooks/useClock'
import { ClockRegular, CloudRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons';
interface GreetingHeaderProps {
  userName?: string
  showGreetingIcon?: boolean
  showClockIcon?: boolean
  layout?: 'horizontal' | 'vertical'
  compact?: boolean
}

/**
 * GreetingHeader - Combined greeting and live clock header component
 * Perfect for dashboard headers and top navigation areas
 * 
 * @param {GreetingHeaderProps} props
 * @param {string} [props.userName] - User name for personalized greeting
 * @param {boolean} [props.showGreetingIcon=true] - Show phase icon
 * @param {boolean} [props.showClockIcon=true] - Show clock icon
 * @param {string} [props.layout='horizontal'] - Layout direction
 * @param {boolean} [props.compact=false] - Compact display mode
 * 
 * @example
 * <GreetingHeader userName="John" layout="vertical" />
 * 
 * @example
 * <GreetingHeader userName="Sarah" layout="horizontal" compact={true} />
 */
export function GreetingHeader({
  userName,
  showGreetingIcon = true,
  showClockIcon = true,
  layout = 'horizontal',
  compact = false
}: GreetingHeaderProps) {
  const { phrase, subMessage, phase } = useGreeting()
  const { timeString, dateString, dateShort } = useClock()

  const phaseIcons: Record<string, React.ReactNode> = {
    morning: <WeatherSunnyRegular className="w-5 h-5 text-primary" />,
    afternoon: <CloudRegular className="w-5 h-5 text-muted-foreground" />,
    evening: <CloudRegular className="w-5 h-5 text-muted-foreground" />,
    night: <WeatherMoonRegular className="w-5 h-5 text-muted-foreground" />
  }

  const isHorizontal = layout === 'horizontal'

  return (
    <div
      className={`flex ${
        isHorizontal ? 'flex-row items-center justify-between' : 'flex-col gap-4'
      } gap-6`}
    >
      {/* Greeting Section */}
      <div className={`flex items-center ${isHorizontal ? 'gap-4' : 'gap-3'}`}>
        {showGreetingIcon && (
          <div className="flex-shrink-0">
            {phaseIcons[phase]}
          </div>
        )}
        
        <div className="flex-1">
          <h1
            className={`font-bold text-foreground ${
              compact ? 'text-lg' : 'text-2xl'
            }`}
          >
            {phrase}
            {userName && (
              <span className="text-primary ml-1">{userName}</span>
            )}
          </h1>
          
          {!compact && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {subMessage}
            </p>
          )}
        </div>
      </div>

      {/* Clock Section */}
      <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
        {showClockIcon && (
          <ClockRegular className={`flex-shrink-0 text-blue-600 ${
            compact ? 'w-4 h-4' : 'w-5 h-5'
          }`} />
        )}
        
        <div className="text-right">
          <div
            className={`font-mono font-semibold tracking-wider text-foreground ${
              compact ? 'text-sm' : 'text-lg'
            }`}
          >
            {timeString}
          </div>
          
          {!compact && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {dateString}
            </div>
          )}
          
          {compact && (
            <div className="text-xs text-muted-foreground">
              {dateShort}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export type { GreetingHeaderProps }


