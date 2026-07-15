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
import { CalendarRegular, ChevronDownRegular, ClockRegular, LineHorizontal3Regular, PersonRegular, SettingsRegular, SignOutRegular } from '@fluentui/react-icons';
import { NotificationBell } from './NotificationBell'
import { MessagesBell } from './MessagesBell'
import { ThemeToggle } from './ThemeToggle'
import { SiteSelector } from './SiteSelector'
import { DateRangeSelector } from './DateRangeSelector'
import { useClock } from '@/hooks/useClock'
import toast from 'react-hot-toast'
import { SearchPalette } from '@/components/shared/SearchPalette'
import Link from 'next/link'

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

      <div className="flex-1 flex justify-start px-2 min-w-0">
        <SearchPalette />
      </div>

      <div className="flex items-center gap-1.5">
        <SiteSelector />
        <DateRangeSelector />

        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-lg border border-border mr-0.5">
          <ClockRegular className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground tabular-nums">{timeString}</span>
          <span className="text-xs text-muted-foreground">{dateShort}</span>
        </div>

        <NotificationBell />
        <MessagesBell />

        <Link
          href="/tasks-requests/calendar"
          title="Calendar"
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
        >
          <CalendarRegular className="h-5 w-5" />
        </Link>

        <ThemeToggle />

        <div className="w-px h-6 bg-border mx-1 hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-muted transition-colors duration-200">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <ChevronDownRegular className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-1.5">
              <p className="text-sm font-semibold text-foreground leading-none truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground leading-none mt-1 truncate">{user.role.replace(/_/g, ' ')}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings/users')}>
              <PersonRegular className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/company')}>
              <SettingsRegular className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
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
