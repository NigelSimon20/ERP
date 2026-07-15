'use client'

import { useState, useEffect, Suspense, ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCurrentUser } from '@/lib/user-context'
import { useGreeting } from '@/hooks/useGreeting'
import { useClock } from '@/hooks/useClock'
import toast from 'react-hot-toast'
import { BriefcaseRegular, ChevronDownRegular, GridRegular, MoneyRegular, PeopleTeamRegular, PersonRegular, ShieldRegular } from '@fluentui/react-icons';
const ROLE_BADGE: Record<string, { bg: string; label: string }> = {
  SUPER_ADMIN:          { bg: 'bg-primary text-white',     label: 'Executive' },
  ADMIN:                { bg: 'bg-primary text-white',     label: 'Executive' },
  FINANCE_MANAGER:      { bg: 'bg-blue-500 text-white',     label: 'Finance' },
  OPERATIONS_MANAGER:   { bg: 'bg-foreground text-background', label: 'Operations' },
  HR_MANAGER:           { bg: 'bg-brand-navy text-white',  label: 'Human Resources' },
  BD_MANAGER:           { bg: 'bg-green-600 text-white',   label: 'Business Dev.' },
  GUARD:                { bg: 'bg-amber-500 text-white',   label: 'Guard' },
  STAFF:                { bg: 'bg-gray-500 text-white', label: 'Staff' },
  READ_ONLY:            { bg: 'bg-muted text-foreground',  label: 'View Only' },
}

const VIEW_AS_OPTIONS = [
  { label: 'Executive',         path: '/dashboard/executive',            Icon: GridRegular },
  { label: 'Finance',           path: '/dashboard/finance',              Icon: MoneyRegular },
  { label: 'Operations',        path: '/dashboard/operations',           Icon: ShieldRegular },
  { label: 'Human Resources',   path: '/dashboard/hr',                   Icon: PeopleTeamRegular },
  { label: 'Business Dev',      path: '/dashboard/business-development', Icon: BriefcaseRegular },
  { label: 'Guard',             path: '/dashboard/guard',                Icon: PersonRegular },
  { label: 'Staff',             path: '/dashboard/staff',                Icon: PersonRegular },
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
  const { role, name } = useCurrentUser()
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.READ_ONLY
  const canViewAs = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const [viewAsOpen, setViewAsOpen] = useState(false)
  const { phrase, subMessage } = useGreeting()
  const { dateString } = useClock()
  const firstName = name?.split(' ')[0] ?? ''

  return (
    <div>
      <Suspense fallback={null}>
        <BlockedNotice />
      </Suspense>

      {/* Greeting */}
      <div className="mb-3">
        <p className="text-lg font-bold text-foreground">{phrase}{firstName && `, ${firstName}`}!</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subMessage} · {dateString}</p>
      </div>

      {/* Page header bar */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.bg}`}>
            {badge.label}
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground tracking-tight truncate">{title}</h1>
            <p className="text-xs text-brand-muted-light truncate mt-0.5">{subtitle}</p>
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
                <GridRegular className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View As</span>
                <ChevronDownRegular className="h-2.5 w-2.5" />
              </button>

              {viewAsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setViewAsOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-card border border-border rounded-[12px] shadow-dropdown py-1.5 z-20">
                    {VIEW_AS_OPTIONS.map(({ label, path, Icon }) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => { setViewAsOpen(false); router.push(path) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Icon className="h-4 w-4 text-brand-muted-light" />
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


