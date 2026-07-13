'use client'

import React, { useState, forwardRef } from 'react'
import { LuEye as Eye, LuEyeOff as EyeOff, LuLock as Lock } from 'react-icons/lu'
import { Label } from '@/components/ui/label'

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  showIcon?: boolean
}

/**
 * PasswordInput - Reusable password input component with toggle visibility
 * Includes leading lock icon and trailing eye icon for toggling visibility
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, showIcon = true, className, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className="w-full space-y-2">
        {label && (
          <Label htmlFor={props.id} className="text-sm font-medium text-gray-900">
            {label}
          </Label>
        )}
        
        <div className="relative">
          {/* Leading Lock Icon */}
          {showIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Lock className="w-5 h-5 text-gray-400" />
            </div>
          )}

          {/* Input Field */}
          <input
            ref={ref}
            type={showPassword ? 'text' : 'password'}
            className={`
              w-full px-4 py-3 pl-12 pr-12 border border-gray-200 rounded-lg
              font-sans text-base text-gray-900 placeholder-gray-500
              bg-white transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-premium-primary focus:ring-opacity-50 focus:border-premium-primary
              hover:border-gray-300
              disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
              ${error ? 'border-brand-red focus:ring-brand-red focus:border-brand-red' : ''}
              ${className}
            `}
            {...props}
          />

          {/* Trailing Eye Icon */}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600 transition-colors duration-200 focus:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-sm font-medium text-brand-red mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'

export { PasswordInput }
