'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNav } from './MobileNav'
import { Toaster } from 'react-hot-toast'
import { UserProvider, UserInfo } from '@/lib/user-context'
import { DashboardFilterProvider } from '@/lib/dashboard-filter-context'
import { WelcomeModal, type WelcomeData } from '@/components/auth/WelcomeModal'
import { WELCOME_DATA_STORAGE_KEY } from '@/components/auth/LoginForm'

interface DashboardShellProps {
  user: UserInfo
  children: React.ReactNode
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [welcomeData, setWelcomeData] = useState<WelcomeData | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(WELCOME_DATA_STORAGE_KEY)
    if (!raw) return
    sessionStorage.removeItem(WELCOME_DATA_STORAGE_KEY)
    try {
      setWelcomeData(JSON.parse(raw))
    } catch {
      // Ignore malformed/stale data
    }
  }, [])

  return (
    <UserProvider value={user}>
      <DashboardFilterProvider>
        {welcomeData && (
          <WelcomeModal data={welcomeData} onClose={() => setWelcomeData(null)} />
        )}
        <div className="flex h-screen overflow-hidden bg-brand-light">
          {/* Desktop sidebar */}
          <div className="hidden lg:flex">
            <Sidebar role={user.role} />
          </div>

          {/* Mobile sidebar */}
          <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} role={user.role} />

          {/* Main area */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar user={user} onMenuClick={() => setMobileOpen(true)} />
            <main className="flex-1 overflow-y-auto p-5 md:p-7 bg-background">
              {children}
            </main>
          </div>

          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        </div>
      </DashboardFilterProvider>
    </UserProvider>
  )
}
