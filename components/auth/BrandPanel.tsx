'use client'

import React from 'react'
import Image from 'next/image'
import { LuShield } from 'react-icons/lu'
import { FeatureGrid } from './FeatureGrid'
import styles from './BrandPanel.module.css'

/**
 * BrandPanel - Left side panel with branding, features, and security message
 * Displays logo, headline, features, and pledge message
 */
export function BrandPanel() {
  return (
    <div
      className={`hidden md:flex md:flex-col justify-between p-8 lg:p-12 relative overflow-hidden basis-1/2 min-h-screen ${styles.brandPanel}`}
    >
      {/* Background overlay */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Content */}
      <div className="relative z-10 space-y-8">
        {/* Logo Section */}
        <div className="flex flex-col items-start gap-4">
          <div className="w-32 h-32 relative">
            <Image
              src="/assets/login/raven-logo.jpeg"
              alt="RavenShield Logo"
              width={128}
              height={128}
              className="object-contain"
            />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Your Security Our Pledge.</p>
          </div>
        </div>

        {/* Header & Subtext */}
        <div className="space-y-3">
          <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
            Security ERP<br />Management System
          </h1>
          <p className="text-base text-white/90 leading-relaxed max-w-md font-medium">
            A comprehensive ERP solution
          </p>
        </div>

        {/* Feature Grid */}
        <div className="pt-4">
          <FeatureGrid />
        </div>
      </div>

      {/* Footer Pledge */}
      <div className="relative z-10 flex items-center gap-2 text-white text-sm font-bold">
        <LuShield className="w-5 h-5" />
        <span>Secure. Reliable. Always.</span>
      </div>
    </div>
  )
}
