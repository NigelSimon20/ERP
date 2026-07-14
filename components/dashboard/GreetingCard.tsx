'use client'

import React from 'react'
import { useGreeting } from '@/hooks/useGreeting'
import { CloudRegular, FlashRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons';
interface GreetingCardProps {
  userName?: string
  showIcon?: boolean
}

/**
 * GreetingCard - Displays time-based greeting with phase icon
 * Shows different greeting based on time of day
 * 
 * @param {GreetingCardProps} props
 * @param {string} [props.userName] - Optional user name to personalize greeting
 * @param {boolean} [props.showIcon=true] - Whether to show the phase icon
 * 
 * @example
 * <GreetingCard userName="John" showIcon={true} />
 */
export function GreetingCard({ userName, showIcon = true }: GreetingCardProps) {
  const { phrase, subMessage, phase } = useGreeting()

  // Map phases to appropriate icons — neutral/brand-red only, no blue/purple decorative accents
  const phaseIcons: Record<string, React.ReactNode> = {
    morning: <WeatherSunnyRegular className="w-6 h-6 text-primary" />,
    afternoon: <CloudRegular className="w-6 h-6 text-muted-foreground" />,
    evening: <CloudRegular className="w-6 h-6 text-muted-foreground" />,
    night: <WeatherMoonRegular className="w-6 h-6 text-muted-foreground" />
  }

  return (
    <div className="flex items-center gap-4">
      {showIcon && (
        <div className="flex-shrink-0">
          {phaseIcons[phase]}
        </div>
      )}
      
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-foreground">
          {phrase}
          {userName && <span className="text-primary">, {userName}</span>}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {subMessage}
        </p>
      </div>
    </div>
  )
}

export type { GreetingCardProps }


