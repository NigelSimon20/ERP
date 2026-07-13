import { FaArrowUp, FaArrowDown } from 'react-icons/fa'

type Color = 'red' | 'navy' | 'white' | 'green' | 'amber' | 'blue' | 'purple'

const ICON_MAP: Record<Color, string> = {
  red:    'bg-[#FDEDEE] text-[#E74C5B]',
  white:  'bg-[#FDEDEE] text-[#E74C5B]',
  navy:   'bg-[#F3F4F6] text-[#374151]',
  green:  'bg-[#DCFCE7] text-[#16A34A]',
  amber:  'bg-[#FEF3C7] text-[#92400E]',
  blue:   'bg-[#DBEAFE] text-[#1D4ED8]',
  purple: 'bg-[#F3E8FF] text-[#7C3AED]',
}

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: Color
  trend?: { value: number; direction: 'up' | 'down'; label?: string }
}

export function KPICard({ title, value, subtitle, icon: Icon, color, trend }: KPICardProps) {
  const iconCls = ICON_MAP[color] ?? ICON_MAP.red

  return (
    <div className="erp-card flex flex-col gap-4 !p-5 group">
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconCls}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${
            trend.direction === 'up' ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#B91C1C]'
          }`}>
            {trend.direction === 'up'
              ? <FaArrowUp className="h-2.5 w-2.5" />
              : <FaArrowDown className="h-2.5 w-2.5" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-[#1F2937] mt-0.5 tabular-nums leading-none">{value}</p>
        {subtitle && <p className="text-xs text-[#9CA3AF] mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}


