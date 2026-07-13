'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FaBars, FaSignOutAlt, FaUser, FaCog, FaChevronDown, FaClock } from 'react-icons/fa'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { useClock } from '@/hooks/useClock'
import toast from 'react-hot-toast'

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
    <header className="h-16 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-5 flex-shrink-0 shadow-topbar">
      <button
        type="button"
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
        aria-label="Open menu"
      >
        <FaBars className="h-5 w-5" />
      </button>

      <div className="hidden lg:block">
        <p className="text-xs text-[#9CA3AF] font-semibold tracking-wide">{user.companyName}</p>
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] mr-1">
          <FaClock className="h-3.5 w-3.5 text-[#E74C5B]" />
          <span className="text-xs font-semibold text-[#374151] tabular-nums">{timeString}</span>
          <span className="text-xs text-[#9CA3AF]">{dateShort}</span>
        </div>

        <NotificationBell />

        <div className="w-px h-6 bg-[#E5E7EB] mx-1 hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-[#F9FAFB] transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-brand-red text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-[#1F2937] leading-none">{user.name}</p>
                <p className="text-xs text-[#9CA3AF] leading-none mt-0.5">{user.role.replace(/_/g, ' ')}</p>
              </div>
              <FaChevronDown className="h-3 w-3 text-[#9CA3AF] hidden sm:block" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push('/settings/users')}>
              <FaUser className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/company')}>
              <FaCog className="h-4 w-4 mr-2" />
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
              className="text-red-600 focus:text-red-600"
            >
              <FaSignOutAlt className="h-4 w-4 mr-2" />
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
