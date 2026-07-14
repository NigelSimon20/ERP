'use client'

import React from 'react'
import { ArrowTrendingRegular as BarChart3, FlashRegular as Zap, PeopleRegular as Users, ShieldRegular as Shield } from '@fluentui/react-icons';
interface Feature {
  icon: React.ReactNode
  label: string
}

/**
 * FeatureGrid - Display four security and operations features
 * Used in the left brand panel to highlight key capabilities
 */
export function FeatureGrid() {
  const features: Feature[] = [
    {
      icon: <Shield className="w-8 h-8" />,
      label: 'Secure Access',
    },
    {
      icon: <BarChart3 className="w-8 h-8" />,
      label: 'Real-time Insights',
    },
    {
      icon: <Users className="w-8 h-8" />,
      label: 'Team Management',
    },
    {
      icon: <Zap className="w-8 h-8" />,
      label: 'Smart Operations',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-6">
      {features.map((feature, idx) => (
        <div
          key={idx}
          className="flex flex-col items-center text-center"
        >
          <div className="mb-3 flex items-center justify-center w-16 h-16 bg-brand-red rounded-lg">
            {feature.icon}
          </div>
          <h3 className="font-bold text-white text-sm">
            {feature.label}
          </h3>
        </div>
      ))}
    </div>
  )
}
