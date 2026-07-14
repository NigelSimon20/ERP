import { ArrowDownRegular, ArrowUpRegular } from '@fluentui/react-icons';
type Color = 'red' | 'navy' | 'white' | 'green' | 'amber' | 'blue' | 'purple'

const ICON_MAP: Record<Color, string> = {
  red:    'bg-primary/10 text-primary',
  white:  'bg-primary/10 text-primary',
  navy:   'bg-muted text-foreground',
  green:  'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  amber:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  blue:   'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  purple: 'bg-muted text-foreground',
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
            trend.direction === 'up' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300'
          }`}>
            {trend.direction === 'up'
              ? <ArrowUpRegular className="h-2.5 w-2.5" />
              : <ArrowDownRegular className="h-2.5 w-2.5" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5 tabular-nums leading-none">{value}</p>
        {subtitle && <p className="text-xs text-brand-muted-light mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

