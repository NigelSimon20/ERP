/** Reusable skeleton loaders for dashboard loading states */

export function SkeletonKPI({ count = 4, cols = 4 }: { count?: number; cols?: number }) {
  const colClass: Record<number, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }
  return (
    <div className={`grid ${colClass[cols] ?? 'grid-cols-2 sm:grid-cols-4'} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="erp-card !p-5 animate-pulse">
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 bg-border rounded-xl" />
            <div className="h-5 w-12 bg-border rounded-full" />
          </div>
          <div className="space-y-2">
            <div className="h-2.5 w-20 bg-border rounded" />
            <div className="h-7 w-14 bg-border rounded" />
            <div className="h-2.5 w-24 bg-border rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 240 }: { height?: number }) {
  const heightClass = height <= 160 ? 'h-40' : height <= 200 ? 'h-48' : height <= 240 ? 'h-60' : height <= 280 ? 'h-72' : 'h-80'
  return (
    <div className="erp-card !p-0 overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="space-y-1.5">
          <div className="h-4 w-40 bg-border rounded" />
          <div className="h-3 w-24 bg-border rounded" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-7 w-7 bg-border rounded-lg" />
          <div className="h-7 w-7 bg-border rounded-lg" />
        </div>
      </div>
      <div className="px-5 py-4">
        <div className={`bg-muted/50 rounded-xl ${heightClass}`} />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="erp-card !p-0 overflow-hidden animate-pulse">
      <div className="px-5 py-4 border-b border-border">
        <div className="h-4 w-40 bg-border rounded" />
      </div>
      <div className="px-5 py-3 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-8 w-8 bg-border rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 bg-border rounded" />
              <div className="h-2.5 w-1/2 bg-border rounded" />
            </div>
            <div className="h-5 w-16 bg-border rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}


