'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LuUser as User, LuLoader as Loader2 } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { PasswordInput } from './PasswordInput'
import { SocialLogin } from './SocialLogin'
import { WelcomeModal, type WelcomeData } from './WelcomeModal'
import toast from 'react-hot-toast'

// Updated login schema to accept username or email
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginFormProps {
  onForgotPassword?: () => void
}

/**
 * LoginForm - Main login form component with email/username and password
 * Includes remember me checkbox, forgot password link, and SSO options
 */
export function LoginForm({ onForgotPassword }: LoginFormProps) {
  const router = useRouter()
  const [rememberMe, setRememberMe] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [welcomeData, setWelcomeData] = useState<WelcomeData | null>(null)
  const [pendingPath, setPendingPath] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    setGeneralError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const json = await res.json()

      if (!res.ok) {
        setGeneralError(json.error || 'Login failed')
        toast.error(json.error || 'Login failed')
        return
      }

      if (json.user.mustChangePassword) {
        router.push('/change-password')
        return
      }

      // Show welcome modal before navigating to dashboard
      const path = json.dashboardPath ?? '/dashboard'
      setPendingPath(path)
      setWelcomeData({
        name: json.user.name,
        role: json.user.role,
        companyName: json.user.companyName,
        department: json.user.department ?? null,
        lastLogin: json.user.lastLogin ?? null,
        unreadCount: json.unreadCount ?? 0,
        pendingTasks: json.pendingTasks ?? 0,
        dashboardPath: path,
      })
    } catch (err) {
      setGeneralError('Network error. Please try again.')
      toast.error('Network error. Please try again.')
    }
  }

  return (
    <>
      {welcomeData && (
        <WelcomeModal
          data={welcomeData}
          onClose={() => setWelcomeData(null)}
        />
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* General Error Message */}
      {generalError && (
        <div className="p-4 bg-brand-red/10 border border-brand-red/20 rounded-lg">
          <p className="text-sm font-medium text-brand-red-dark">{generalError}</p>
        </div>
      )}

      {/* Email Field */}
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-sm font-medium text-gray-900"
        >
          Username or Email
        </Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <User className="w-5 h-5 text-gray-400" />
          </div>
          <input
            {...register('email')}
            type="email"
            id="email"
            placeholder="Enter your username or email"
            className={`
              w-full px-4 py-3 pl-12 border border-gray-200 rounded-lg
              font-sans text-base text-gray-900 placeholder-gray-500
              bg-white transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-premium-primary focus:ring-opacity-50 focus:border-premium-primary
              hover:border-gray-300
              disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
              ${errors.email ? 'border-brand-red focus:ring-brand-red focus:border-brand-red' : ''}
            `}
            disabled={isSubmitting}
          />
        </div>
        {errors.email && (
          <p className="text-sm font-medium text-brand-red mt-1">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password Field */}
      <PasswordInput
        {...register('password')}
        id="password"
        label="Password"
        placeholder="Enter your password"
        error={errors.password?.message}
        disabled={isSubmitting}
      />

      {/* Form Actions Row */}
      <div className="flex items-center justify-between pt-2">
        {/* Remember Me Checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked as boolean)}
            disabled={isSubmitting}
          />
          <Label
            htmlFor="remember"
            className="text-sm font-medium text-gray-700 cursor-pointer"
          >
            Remember me
          </Label>
        </div>

        {/* Forgot Password Link */}
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm font-medium text-premium-primary hover:text-premium-primary/80 
                     transition-colors duration-200 focus:outline-none focus:underline"
          disabled={isSubmitting}
        >
          Forgot Password?
        </button>
      </div>

      {/* Sign In Button */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 mt-6 bg-premium-primary hover:bg-premium-primary/90 text-white font-semibold 
                   rounded-lg transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-premium-primary/30
                   flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <span>Sign In</span>
          </>
        )}
      </Button>

      {/* Social Login */}
      <SocialLogin loading={isSubmitting} />

      {/* Sign Up Link */}
      <p className="text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <a
          href="/register"
          className="font-semibold text-premium-primary hover:text-premium-primary/80 
                     transition-colors duration-200"
        >
          Sign up here
        </a>
      </p>
    </form>
    </>
  )
}
