'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDownRegular, ClockRegular, LineHorizontal3Regular, PersonRegular, SettingsRegular, SignOutRegular } from '@fluentui/react-icons';
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { useClock } from '@/hooks/useClock'
import toast from 'react-hot-toast'
import { SearchPalette } from '@/components/shared/SearchPalette'

interface TopBarProps {
  user: { name: string; email: string; role: string; companyName?: string }
  onMenuClick: () => void
}

export function TopBar({ user, onMenuClick }: TopBarProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const { timeString, dateShort } = useClock()

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Logout request failed:', err)
    }
    toast.success('Signed out')
    router.push('/login')
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-5 flex-shrink-0 shadow-topbar">
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors duration-200"
        aria-label="Open menu"
      >
        <LineHorizontal3Regular className="h-5 w-5" />
      </button>

      <div className="hidden lg:block">
        <p className="text-xs text-muted-foreground font-semibold tracking-wide">{user.companyName}</p>
      </div>

      <div className="flex-1 flex justify-center px-2 min-w-0">
        <SearchPalette />
      </div>

      <div className="flex items-center gap-1.5">
        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-lg border border-border mr-1">
          <ClockRegular className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground tabular-nums">{timeString}</span>
          <span className="text-xs text-muted-foreground">{dateShort}</span>
        </div>

        <NotificationBell />

        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-muted transition-colors duration-200">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-foreground leading-none">{user.name}</p>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">{user.role.replace(/_/g, ' ')}</p>
              </div>
              <ChevronDownRegular className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push('/settings/users')}>
              <PersonRegular className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/company')}>
              <SettingsRegular className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-1 py-0.5">
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-primary focus:text-primary"
            >
              <SignOutRegular className="h-4 w-4 mr-2" />
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
