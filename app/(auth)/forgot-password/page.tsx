'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MailRegular as Mail, SpinnerIosRegular as Loader2 } from '@fluentui/react-icons'
import { BrandPanel } from '@/components/auth/BrandPanel'
import { LoginCard } from '@/components/auth/LoginCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? 'Something went wrong. Try again.')
      else setMessage(json.message)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-card">
      <main className="min-h-screen grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
        <BrandPanel />
        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 md:px-12 lg:px-16">
          <LoginCard title="Reset your password" subtitle="Enter your account email and we'll send you a reset link">
            {message ? (
              <p role="status" className="text-sm text-foreground text-center">{message}</p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5" noValidate>
                {error && <p role="alert" className="text-sm font-medium text-brand-red">{error}</p>}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                      <Mail className="w-5 h-5 text-brand-muted-light" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={submitting}
                      className="w-full px-4 py-3 pl-12 border border-border rounded-lg font-sans text-base text-foreground placeholder-muted-foreground bg-card focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-muted/50"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={submitting || !email}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            )}
            <p className="text-center text-sm">
              <Link href="/login" className="font-medium text-primary hover:text-primary/80">Back to sign in</Link>
            </p>
          </LoginCard>
        </section>
      </main>
    </div>
  )
}
