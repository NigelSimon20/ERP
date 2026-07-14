'use client'

import React, { useState, forwardRef } from 'react'
import { Label } from '@/components/ui/label'
import { EyeOffRegular as EyeOff, EyeRegular as Eye, LockClosedRegular as Lock } from '@fluentui/react-icons';

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
          <Label htmlFor={props.id} className="text-sm font-medium text-foreground">
            {label}
          </Label>
        )}
        
        <div className="relative">
          {/* Leading Lock Icon */}
          {showIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Lock className="w-5 h-5 text-brand-muted-light" />
            </div>
          )}

          {/* Input Field */}
          <input
            ref={ref}
            type={showPassword ? 'text' : 'password'}
            className={`
              w-full px-4 py-3 pl-12 pr-12 border border-border rounded-lg
              font-sans text-base text-foreground placeholder-muted-foreground
              bg-card transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 focus:border-primary
              hover:border-border
              disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed
              ${error ? 'border-brand-red focus:ring-brand-red focus:border-brand-red' : ''}
              ${className}
            `}
            {...props}
          />

          {/* Trailing Eye Icon */}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-brand-muted-light hover:text-foreground transition-colors duration-200 focus:outline-none"
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
