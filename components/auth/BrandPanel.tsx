'use client'

import React from 'react'
import Image from 'next/image'
import { FeatureGrid } from './FeatureGrid'
import styles from './BrandPanel.module.css'
import { ShieldRegular } from '@fluentui/react-icons';

/**
 * BrandPanel - Left side panel with branding, features, and security message
 * Displays logo, headline, features, and pledge message
 */
export function BrandPanel() {
  return (
    <div
      className={`hidden md:flex md:flex-col justify-between p-8 lg:p-12 relative overflow-hidden basis-1/2 min-h-screen ${styles.brandPanel}`}
    >
      {/* Content */}
      <div className="relative z-10 space-y-8">
        {/* Logo Section */}
        <div className="flex flex-col items-start gap-4">
          <div className="w-44 relative">
            <Image
              src="/brand/infinity-nexa-logo.png"
              alt="Infinity Nexa — Business & IT Services"
              width={562}
              height={451}
              className="object-contain drop-shadow-[0_8px_24px_rgba(56,189,248,0.25)]"
              priority
            />
          </div>
        </div>

        {/* Header & Subtext */}
        <div className="space-y-3">
          <h1 className="font-display text-4xl lg:text-5xl font-semibold text-white leading-tight">
            Infinity Nexa<br /><span className="text-sky-300">ERP</span>
          </h1>
          <p className="text-base text-white/80 leading-relaxed max-w-md font-medium">
            Finance, payroll, HR and operations for security companies, in one system.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="pt-4">
          <FeatureGrid />
        </div>
      </div>

      {/* Footer Pledge */}
      <div className="relative z-10 flex items-center gap-2 text-white text-sm font-bold">
        <ShieldRegular className="w-5 h-5 text-sky-300" />
        <span>Infinity Nexa · Business &amp; IT Services</span>
      </div>
    </div>
  )
}
