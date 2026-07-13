'use client'

import React from 'react'
import { useGreeting } from '@/hooks/useGreeting'
import { FiSun, FiCloud, FiMoon, FiZap } from 'react-icons/fi'

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

  // Map phases to appropriate icons from react-icons
  const phaseIcons: Record<string, React.ReactNode> = {
    morning: <FiSun className="w-6 h-6 text-amber-500" />,
    afternoon: <FiCloud className="w-6 h-6 text-blue-400" />,
    evening: <FiCloud className="w-6 h-6 text-orange-400" />,
    night: <FiMoon className="w-6 h-6 text-indigo-500" />
  }

  return (
    <div className="flex items-center gap-4">
      {showIcon && (
        <div className="flex-shrink-0">
          {phaseIcons[phase]}
        </div>
      )}
      
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-gray-900">
          {phrase}
          {userName && <span className="text-premium-primary">, {userName}</span>}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {subMessage}
        </p>
      </div>
    </div>
  )
}

export type { GreetingCardProps }


