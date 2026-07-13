'use client'

import { useState, type ReactNode } from 'react'
import { FaDownload, FaExpand, FaPrint, FaCompress } from 'react-icons/fa'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  actions?: boolean
  /** Extra content placed in the header right area (e.g. a filter select) */
  headerRight?: ReactNode
  className?: string
}

export function ChartCard({
  title, subtitle, children, actions = true, headerRight, className = '',
}: ChartCardProps) {
  const [fullscreen, setFullscreen] = useState(false)

  const handlePrint = () => window.print()

  return (
    <div className={`erp-card !p-0 overflow-hidden transition-all duration-200 ${fullscreen ? 'fixed inset-4 z-50 shadow-dropdown' : ''} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1F2937] truncate">{title}</p>
          {subtitle && <p className="text-xs text-[#9CA3AF] mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-3">
          {headerRight && <div className="mr-1">{headerRight}</div>}
          {actions && (
            <>
              <button
                type="button"
                onClick={handlePrint}
                title="Print"
                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#374151] transition-colors"
              >
                <FaPrint className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setFullscreen(v => !v)}
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#374151] transition-colors"
              >
                {fullscreen
                  ? <FaCompress className="h-3 w-3" />
                  : <FaExpand className="h-3 w-3" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={`px-5 py-4 ${fullscreen ? 'h-[calc(100%-57px)] overflow-auto' : ''}`}>
        {children}
      </div>

      {/* Fullscreen backdrop */}
      {fullscreen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 -z-[1]"
          onClick={() => setFullscreen(false)}
        />
      )}
    </div>
  )
}


