'use client'

import React from 'react'
import { ShieldRegular as Shield } from '@fluentui/react-icons';
interface LoginCardProps {
  children: React.ReactNode
}

/**
 * LoginCard - Premium login card container
 * Provides a bright, white form panel with soft shadows for clear legibility
 */
export function LoginCard({ children }: LoginCardProps) {
  return (
    <div className="w-full flex flex-col justify-center items-center px-4 sm:px-8 py-8 md:py-10 bg-transparent">
      {/* Container with animation */}
      <div className="w-full max-w-xl animate-slide-in-right">
        {/* Card */}
        <div className="bg-card rounded-[2rem] shadow-[0_40px_90px_rgba(15,23,42,0.12)] border border-border p-10 space-y-6">
          {/* Header Section */}
          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-bold text-foreground">
              Welcome Back
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign in to access your Security ERP dashboard
            </p>
          </div>

          {/* Form Content */}
          {children}

          {/* Footer Security Pledge */}
          <div className="pt-4 border-t border-border flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-4 h-4 text-brand-red" />
            <span>Your Security. Our Pledge.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
