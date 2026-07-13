'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FaShieldAlt, FaUser, FaBriefcase, FaBuilding, FaLayerGroup, FaCalendarAlt, FaClock, FaBell, FaTasks, FaArrowRight, FaHistory } from 'react-icons/fa'
import { useClock } from '@/hooks/useClock'

export interface WelcomeData {
  name: string
  role: string
  companyName: string
  department?: string | null
  lastLogin?: string | null
  unreadCount: number
  pendingTasks: number
  dashboardPath: string
}

interface WelcomeModalProps {
  data: WelcomeData
  onClose: () => void
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:        'Super Administrator',
  ADMIN:              'Administrator',
  FINANCE_MANAGER:    'Finance Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  HR_MANAGER:         'HR Manager',
  BD_MANAGER:         'Business Development Manager',
  STAFF:              'Staff',
  GUARD:              'Security Guard',
  CLIENT:             'Client Portal User',
  READ_ONLY:          'Read Only',
}

const AUTO_DISMISS_SECONDS = 10

export function WelcomeModal({ data, onClose }: WelcomeModalProps) {
  const router = useRouter()
  const { timeString, dateString } = useClock()
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS)
  const [visible, setVisible] = useState(false)

  const dismiss = useCallback((path: string) => {
    setVisible(false)
    setTimeout(() => {
      onClose()
      router.push(path)
    }, 300)
  }, [onClose, router])

  // Slide-in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss countdown
  useEffect(() => {
    if (countdown <= 0) {
      dismiss(data.dashboardPath)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, dismiss, data.dashboardPath])

  const roleLabel = ROLE_LABELS[data.role] ?? data.role.replace(/_/g, ' ')
  const initials = data.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const formatLastLogin = (iso: string | null | undefined) => {
    if (!iso) return 'First login'
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return 'Unknown'
    }
  }

  return (
    // Backdrop
    <div
      className={`fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Modal card */}
      <div
        className={`relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden transition-all duration-[350ms] ${
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
        }`}
      >
        {/* Header strip */}
        <div className="relative bg-gradient-to-br from-[#E74C5B] to-[#c0392b] px-6 pt-8 pb-10">
          {/* Shield icon bg */}
          <div className="absolute top-4 right-4 opacity-10">
            <FaShieldAlt className="w-20 h-20 text-white" />
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center text-white text-xl font-bold border-2 border-white/30">
              {initials}
            </div>
            <div>
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Welcome back</p>
              <h2 className="text-white text-2xl font-bold leading-tight">{data.name}</h2>
              <p className="text-white/80 text-sm font-medium mt-0.5">{roleLabel}</p>
            </div>
          </div>
        </div>

        {/* Wave separator */}
        <div className="relative -mt-4">
          <svg viewBox="0 0 400 20" className="w-full" preserveAspectRatio="none">
            <path d="M0,20 L0,10 Q100,0 200,10 Q300,20 400,10 L400,20 Z" fill="white" />
          </svg>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 -mt-2">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            <InfoRow icon={<FaBuilding className="text-[#E74C5B]" />} label="Company" value={data.companyName} />
            <InfoRow icon={<FaLayerGroup className="text-[#E74C5B]" />} label="Department" value={data.department || '—'} />
            <InfoRow icon={<FaCalendarAlt className="text-[#E74C5B]" />} label="Date" value={dateString} />
            <InfoRow icon={<FaClock className="text-[#E74C5B]" />} label="Time" value={timeString} />
            <InfoRow icon={<FaHistory className="text-[#E74C5B]" />} label="Last Login" value={formatLastLogin(data.lastLogin)} />
            <InfoRow icon={<FaBriefcase className="text-[#E74C5B]" />} label="Role" value={roleLabel} />
          </div>

          {/* Notification & task badges */}
          <div className="flex gap-3 mb-5">
            <div className="flex-1 flex items-center gap-2.5 bg-[#FEF3C7] rounded-xl px-3.5 py-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#F59E0B]/20 flex items-center justify-center">
                <FaBell className="text-[#F59E0B] h-4 w-4" />
              </div>
              <div>
                <p className="text-[#92400E] text-lg font-bold leading-none">{data.unreadCount}</p>
                <p className="text-[#78350F] text-xs font-medium mt-0.5">Unread Notifications</p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2.5 bg-[#DBEAFE] rounded-xl px-3.5 py-2.5">
              <div className="h-8 w-8 rounded-lg bg-[#3B82F6]/20 flex items-center justify-center">
                <FaTasks className="text-[#3B82F6] h-4 w-4" />
              </div>
              <div>
                <p className="text-[#1D4ED8] text-lg font-bold leading-none">{data.pendingTasks}</p>
                <p className="text-[#1E40AF] text-xs font-medium mt-0.5">Pending Tasks</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => dismiss(data.dashboardPath)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-[#E74C5B] text-white text-sm font-semibold hover:bg-[#D63F4F] transition-colors"
            >
              Continue
              <FaArrowRight className="h-3.5 w-3.5" />
              <span className="text-white/60 text-xs ml-0.5">({countdown}s)</span>
            </button>
            <button
              type="button"
              onClick={() => dismiss('/notifications')}
              className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-[#E5E7EB] text-[#374151] text-sm font-medium hover:bg-[#F9FAFB] transition-colors"
            >
              <FaBell className="h-4 w-4 text-[#E74C5B]" />
              Notifications
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1 bg-[#F3F4F6] rounded-full overflow-hidden">
            <div
              ref={(el) => {
                if (el) {
                  el.style.setProperty('width', `${((AUTO_DISMISS_SECONDS - countdown) / AUTO_DISMISS_SECONDS) * 100}%`)
                  el.style.setProperty('transition', 'width 1s linear')
                }
              }}
              className="h-full bg-[#E74C5B] rounded-full"
            />
          </div>
          <p className="text-center text-xs text-[#9CA3AF] mt-1.5">Auto-redirecting in {countdown}s</p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5 bg-[#F9FAFB] rounded-xl px-3 py-2.5">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[#9CA3AF] text-[10px] font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-[#1F2937] text-xs font-semibold mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}
