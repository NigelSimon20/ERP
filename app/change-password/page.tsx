'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FaShieldAlt } from 'react-icons/fa'
import { FaKey } from 'react-icons/fa'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(j => {
        if (!j.user) router.replace('/login')
        else setChecked(true)
      })
      .catch(() => router.replace('/login'))
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed'); return }
      toast.success('Password changed — redirecting…')
      setTimeout(() => router.replace('/dashboard'), 1000)
    } catch { toast.error('Network error') }
    finally { setLoading(false) }
  }

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <FaShieldAlt size={28} className="text-[#CC0000]" />
            <span className="text-xl font-bold text-[#0D1B2A]">Ravenshield</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 rounded-full px-3 py-1 text-xs font-medium">
            <FaKey className="h-3 w-3" /> Password change required
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h1 className="text-lg font-bold text-[#0D1B2A] mb-1">Set a new password</h1>
          <p className="text-sm text-gray-500 mb-5">
            Your account requires a password change before you can continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white"
            >
              {loading ? 'Saving…' : 'Set Password & Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
