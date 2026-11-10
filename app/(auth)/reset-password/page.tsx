'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SpinnerIosRegular as Loader2 } from '@fluentui/react-icons'
import { BrandPanel } from '@/components/auth/BrandPanel'
import { LoginCard } from '@/components/auth/LoginCard'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { Button } from '@/components/ui/button'

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!token) {
    return <p role="alert" className="text-sm text-center text-brand-red">This reset link is incomplete. Request a new one.</p>
  }
  if (done) {
    return (
      <p role="status" className="text-sm text-center text-foreground">
        Your password has been changed and you&apos;ve been signed out everywhere.{' '}
        <Link href="/login" className="font-medium text-primary">Sign in</Link>
      </p>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? 'Could not reset the password. Try again.')
      else setDone(true)
    } catch {
      setError('Could not reset the password. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <p role="alert" className="text-sm font-medium text-brand-red">{error}</p>}
      <PasswordInput id="password" label="New password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
      <PasswordInput id="confirm" label="Confirm new password" autoComplete="new-password" value={confirm}
        onChange={(e) => setConfirm(e.target.value)} disabled={submitting} />
      <p className="text-xs text-muted-foreground">At least 10 characters, with a letter and a number.</p>
      <Button type="submit" className="w-full" disabled={submitting || !password || !confirm}>
        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Set new password
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-card">
      <main className="min-h-screen grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
        <BrandPanel />
        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 md:px-12 lg:px-16">
          <LoginCard title="Choose a new password" subtitle="This link works once and expires 30 minutes after it was sent">
            {/* useSearchParams needs a Suspense boundary for the static build */}
            <Suspense fallback={null}>
              <ResetPasswordForm />
            </Suspense>
            <p className="text-center text-sm">
              <Link href="/login" className="font-medium text-primary hover:text-primary/80">Back to sign in</Link>
            </p>
          </LoginCard>
        </section>
      </main>
    </div>
  )
}
