'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

interface SocialLoginProps {
  loading?: boolean
}

// Created lazily, once, on first use — the GoTrueClient it holds starts
// background listeners/refresh timers that must not be re-created per click.
let supabaseClientPromise: Promise<SupabaseClient> | null = null
function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      )
    )
  }
  return supabaseClientPromise
}

function isNetworkError(reason: unknown) {
  return reason instanceof Error && /fetch|network/i.test(reason.message)
}

/**
 * SocialLogin - Google OAuth button for social authentication
 * Displays Google sign-in button with actual logo image
 * Integrates with Supabase Google OAuth provider
 */
export function SocialLogin({ loading = false }: SocialLoginProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  // Supabase's client runs some auth calls (session recovery, token refresh)
  // outside the promise we await below, so their rejections surface as
  // unhandled instead of hitting our try/catch. Convert those into a toast
  // while a sign-in attempt is in flight, instead of crashing the page.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (!isLoadingRef.current || !isNetworkError(event.reason)) return
      event.preventDefault()
      console.error('Google login error:', event.reason)
      toast.error('Could not reach Google sign-in. Check your connection and try again.')
      setIsLoading(false)
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true)

      const supabase = await getSupabaseClient()

      // Start Google OAuth flow
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/oauth/callback`,
        },
      })

      if (error) {
        toast.error(error.message || 'Google sign-in failed')
        setIsLoading(false)
        return
      }

      if (data?.url) {
        // Keep the loading state until the browser navigates away.
        window.location.href = data.url
      } else {
        setIsLoading(false)
      }
    } catch (err) {
      console.error('Google login error:', err)
      toast.error('Failed to initiate Google sign-in')
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-muted" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Or continue with
        </span>
        <div className="flex-1 h-px bg-muted" />
      </div>

      {/* Google Button */}
      <div className="w-full">
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleLogin}
          disabled={loading || isLoading}
          className="w-full h-12 border-border hover:border-gray-400 hover:bg-muted/50 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <Image
            src="/assets/login/icons8-google-48.png"
            alt="Google"
            width={24}
            height={24}
            className="w-6 h-6"
            priority
          />
          <span className="text-sm font-medium">
            {isLoading ? 'Signing in...' : 'Sign in with Google'}
          </span>
        </Button>
      </div>
    </div>
  )
}
