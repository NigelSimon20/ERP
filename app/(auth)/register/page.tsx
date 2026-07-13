'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FaUser, FaEnvelope, FaPhone, FaBuilding, FaLock, FaEye, FaEyeSlash, FaExclamationCircle, FaSpinner, FaCheck } from 'react-icons/fa'
import { MdClose } from 'react-icons/md'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerSchema } from '@/lib/validators'
import toast from 'react-hot-toast'
import { BrandPanel } from '@/components/auth/BrandPanel'

type RegisterForm = z.infer<typeof registerSchema>

type StrengthLabel = 'Weak' | 'Fair' | 'Strong'

const STRENGTH_STYLES: Record<StrengthLabel, { bar: string; text: string }> = {
  Weak:   { bar: 'bg-brand-red',   text: 'text-brand-red' },
  Fair:   { bar: 'bg-amber-500', text: 'text-amber-500' },
  Strong: { bar: 'bg-green-600', text: 'text-green-600' },
}

function getPasswordStrength(pw: string): { score: number; label: StrengthLabel | '' } {
  if (!pw) return { score: 0, label: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak' }
  if (score === 2 || score === 3) return { score, label: 'Fair' }
  return { score, label: 'Strong' }
}

const rules = [
  { label: 'At least 8 characters', test: (pw: string) => pw.length >= 8 },
  { label: '1 uppercase letter', test: (pw: string) => /[A-Z]/.test(pw) },
  { label: '1 number', test: (pw: string) => /\d/.test(pw) },
  { label: '1 symbol', test: (pw: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw) },
]

export default function RegisterPage() {
  const router = useRouter()
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const watchedPw = watch('password', '')
  const strength = useMemo(() => getPasswordStrength(watchedPw), [watchedPw])

  async function onSubmit(data: RegisterForm) {
    if (!terms) {
      setError('You must agree to the Terms of Service')
      return
    }

    setError('')
    try {
      const payload = {
        ...data,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        whatsapp: data.whatsapp?.trim() || undefined,
        companyName: data.companyName.trim(),
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Registration failed')
        return
      }

      toast.success('Account created! Welcome to Ravenshield.')
      router.replace('/dashboard/executive')
    } catch {
      setError('Network error. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950/95">
      <main className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <BrandPanel />

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.16)] sm:p-8 lg:p-10">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-brand-red">
                <FaBuilding className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Create your account</h2>
              <p className="mt-2 text-sm text-slate-600">Set up Ravenshield for your company and launch your operations workspace.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <div className="relative">
                    <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="name" placeholder="John Doe" className="pl-10" autoFocus {...register('name')} />
                  </div>
                  {errors.name && <p className="text-xs text-brand-red">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="email" type="email" placeholder="admin@company.com" className="pl-10" {...register('email')} />
                  </div>
                  {errors.email && <p className="text-xs text-brand-red">{errors.email.message}</p>}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <div className="relative">
                    <FaPhone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="phone" placeholder="+263 77 000 0000" className="pl-10" {...register('phone')} />
                  </div>
                  {errors.phone && <p className="text-xs text-brand-red">{errors.phone.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <div className="relative">
                    <FaPhone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input id="whatsapp" placeholder="+263 77 000 0000" className="pl-10" {...register('whatsapp')} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company name</Label>
                <div className="relative">
                  <FaBuilding className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input id="companyName" placeholder="Ravenshield Security Ltd" className="pl-10" {...register('companyName')} />
                </div>
                {errors.companyName && <p className="text-xs text-brand-red">{errors.companyName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    className="pl-10 pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                  </button>
                </div>

                {watchedPw && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={[
                            'h-1 flex-1 rounded-full transition-colors duration-300',
                            strength.label && i <= strength.score
                              ? STRENGTH_STYLES[strength.label].bar
                              : 'bg-slate-200',
                          ].join(' ')}
                        />
                      ))}
                    </div>
                    {strength.label && (
                      <p className={`mb-2 text-xs font-medium ${STRENGTH_STYLES[strength.label].text}`}>
                        {strength.label}
                      </p>
                    )}
                    <ul className="space-y-1">
                      {rules.map((rule) => {
                        const passed = rule.test(watchedPw)
                        return (
                          <li key={rule.label} className="flex items-center gap-1.5 text-xs">
                            {passed ? (
                              <FaCheck className="h-3 w-3 text-green-600 flex-shrink-0" />
                            ) : (
                              <MdClose className="h-3 w-3 text-slate-300 flex-shrink-0" />
                            )}
                            <span className={passed ? 'text-green-700' : 'text-slate-500'}>{rule.label}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                {errors.password && <p className="text-xs text-brand-red">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat your password"
                    className="pl-10 pr-10"
                    {...register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-brand-red">{errors.confirmPassword.message}</p>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-red focus:ring-brand-red"
                />
                <span className="text-sm leading-snug text-slate-600">
                  I agree to the{' '}
                  <span className="font-medium text-brand-red hover:underline">Terms of Service</span>
                </span>
              </label>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-brand-red/20 bg-brand-red/10 px-3 py-2">
                  <FaExclamationCircle className="h-4 w-4 flex-shrink-0 text-brand-red" />
                  <p className="text-sm text-brand-red">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full bg-brand-red text-base font-semibold text-white transition-all duration-300 hover:bg-brand-red-dark"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <FaSpinner className="h-4 w-4 animate-spin" /> Creating account…
                  </span>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-brand-red hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
