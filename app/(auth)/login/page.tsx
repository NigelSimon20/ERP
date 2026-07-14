'use client'

import { BrandPanel } from '@/components/auth/BrandPanel'
import { LoginCard } from '@/components/auth/LoginCard'
import { LoginForm } from '@/components/auth/LoginForm'

/**
 * Premium Enterprise Login Page - Security ERP Management System
 * 
 * Features:
 * - Split-screen layout (responsive to mobile)
 * - Premium white card design for strong legibility
 * - Enterprise-grade security components
 * - Smooth animations and transitions
 * - Full accessibility support
 * - Mobile-first responsive design
 * 
 * Architecture:
 * - Left Panel: Brand messaging with features
 * - Right Panel: Login form with SSO options
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen bg-card">
      <main className="min-h-screen grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
        <BrandPanel />
        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 md:px-12 lg:px-16">
          <LoginCard>
            <LoginForm onForgotPassword={() => {}} />
          </LoginCard>
        </section>
      </main>
    </div>
  )
}
