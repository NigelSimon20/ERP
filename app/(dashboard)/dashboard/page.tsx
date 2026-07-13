'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCurrentUser } from '@/lib/user-context'
import { FaShieldAlt } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { Suspense } from 'react'

const ROLE_MAP: Record<string, string> = {
  SUPER_ADMIN:          '/dashboard/executive',
  ADMIN:                '/dashboard/executive',
  FINANCE_MANAGER:      '/dashboard/finance',
  OPERATIONS_MANAGER:   '/dashboard/operations',
  HR_MANAGER:           '/dashboard/hr',
  BD_MANAGER:           '/dashboard/business-development',
  GUARD:                '/dashboard/guard',
  STAFF:                '/dashboard/staff',
  READ_ONLY:            '/dashboard/readonly',
  CLIENT:               '/portal/client',
}

function RouterInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useCurrentUser()

  useEffect(() => {
    if (searchParams.get('blocked') === 'true') {
      toast.error("You don't have access to that dashboard")
    }
    if (role) {
      const target = ROLE_MAP[role] ?? '/dashboard/readonly'
      router.replace(target)
    }
  }, [role, router, searchParams])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FDEDEE] animate-pulse">
        <FaShieldAlt size={32} className="text-[#E74C5B]" />
      </div>
      <p className="text-sm text-[#9CA3AF] font-medium">Loading your dashboard…</p>
    </div>
  )
}

export default function DashboardRouter() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FDEDEE]">
        <FaShieldAlt size={32} className="text-[#E74C5B]" />
      </div>
      <p className="text-sm text-[#9CA3AF] font-medium">Loading your dashboard…</p>
    </div>
    }>
      <RouterInner />
    </Suspense>
  )
}



