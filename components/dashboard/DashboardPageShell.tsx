'use client'

import { useState, useEffect, Suspense, ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCurrentUser } from '@/lib/user-context'
import toast from 'react-hot-toast'
import { MdDashboard } from 'react-icons/md'
import { FaMoneyBillWave, FaShieldAlt, FaBriefcase, FaHardHat, FaUserTie, FaChevronDown } from 'react-icons/fa'
import { RiTeamLine } from 'react-icons/ri'

const ROLE_BADGE: Record<string, { bg: string; label: string }> = {
  SUPER_ADMIN:          { bg: 'bg-[#E74C5B] text-white',   label: 'Executive' },
  ADMIN:                { bg: 'bg-[#E74C5B] text-white',   label: 'Executive' },
  FINANCE_MANAGER:      { bg: 'bg-[#3B82F6] text-white',   label: 'Finance' },
  OPERATIONS_MANAGER:   { bg: 'bg-[#374151] text-white',   label: 'Operations' },
  HR_MANAGER:           { bg: 'bg-[#7C3AED] text-white',   label: 'Human Resources' },
  BD_MANAGER:           { bg: 'bg-[#22C55E] text-white',   label: 'Business Dev.' },
  GUARD:                { bg: 'bg-[#F59E0B] text-white',   label: 'Guard' },
  STAFF:                { bg: 'bg-[#6B7280] text-white',   label: 'Staff' },
  READ_ONLY:            { bg: 'bg-[#D1D5DB] text-[#374151]', label: 'View Only' },
}

const VIEW_AS_OPTIONS = [
  { label: 'Executive',         path: '/dashboard/executive',            Icon: MdDashboard },
  { label: 'Finance',           path: '/dashboard/finance',              Icon: FaMoneyBillWave },
  { label: 'Operations',        path: '/dashboard/operations',           Icon: FaShieldAlt },
  { label: 'Human Resources',   path: '/dashboard/hr',                   Icon: RiTeamLine },
  { label: 'Business Dev',      path: '/dashboard/business-development', Icon: FaBriefcase },
  { label: 'Guard',             path: '/dashboard/guard',                Icon: FaHardHat },
  { label: 'Staff',             path: '/dashboard/staff',                Icon: FaUserTie },
]

function BlockedNotice() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (searchParams.get('blocked') === 'true') {
      toast.error("You don't have access to that dashboard")
      router.replace(pathname)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

interface Props {
  title: string
  subtitle: string
  children: ReactNode
}

export function DashboardPageShell({ title, subtitle, children }: Props) {
  const router = useRouter()
  const { role } = useCurrentUser()
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.READ_ONLY
  const canViewAs = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const [viewAsOpen, setViewAsOpen] = useState(false)

  return (
    <div>
      <Suspense fallback={null}>
        <BlockedNotice />
      </Suspense>

      {/* Page header bar */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.bg}`}>
            {badge.label}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#1F2937] tracking-tight truncate">{title}</h1>
            <p className="text-xs text-[#9CA3AF] truncate mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canViewAs && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setViewAsOpen(v => !v)}
                className="erp-btn erp-btn-ghost erp-btn-sm"
              >
                <MdDashboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View As</span>
                <FaChevronDown className="h-2.5 w-2.5" />
              </button>

              {viewAsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setViewAsOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-[#E5E7EB] rounded-[12px] shadow-dropdown py-1.5 z-20">
                    {VIEW_AS_OPTIONS.map(({ label, path, Icon }) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => { setViewAsOpen(false); router.push(path) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#F9FAFB] transition-colors"
                      >
                        <Icon className="h-4 w-4 text-[#9CA3AF]" />
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  )
}


