import Image from 'next/image'
import { cn } from '@/lib/utils'

// The Infinity Nexa logo mark and wordmark ("Infinity" in brand blue, "Nexa"
// in silver, as in the logo). `tone="light"` is for dark backgrounds.
export function BrandMark({ size = 'md', tone = 'default', suffix, className }: { size?: 'sm' | 'md'; tone?: 'default' | 'light'; suffix?: string; className?: string }) {
  const mark = size === 'sm' ? { w: 36, h: 18 } : { w: 48, h: 24 }
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image src="/brand/infinity-nexa-mark.png" alt="" width={mark.w} height={mark.h} className="object-contain" />
      <span className={cn('font-display font-semibold tracking-tight', size === 'sm' ? 'text-base' : 'text-xl')}>
        <span className={tone === 'light' ? 'text-sky-300' : 'text-primary'}>Infinity</span>{' '}
        <span className={tone === 'light' ? 'text-white/80' : 'text-muted-foreground'}>Nexa</span>
        {suffix && <span className={cn('ml-1.5', tone === 'light' ? 'text-white' : 'text-foreground')}>{suffix}</span>}
      </span>
    </span>
  )
}
