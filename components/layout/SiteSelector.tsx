'use client'

import { useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BuildingRegular, ChevronDownRegular, CheckmarkRegular } from '@fluentui/react-icons'
import { useDashboardFilter } from '@/lib/dashboard-filter-context'

interface SiteOption {
  id: string
  name: string
}

export function SiteSelector() {
  const { siteId, setSiteId } = useDashboardFilter()
  const [sites, setSites] = useState<SiteOption[]>([])

  useEffect(() => {
    fetch('/api/sites/list')
      .then((res) => (res.ok ? res.json() : { sites: [] }))
      .then((data) => setSites(data.sites ?? []))
      .catch(() => setSites([]))
  }, [])

  const selectedLabel = siteId ? sites.find((s) => s.id === siteId)?.name ?? 'All Sites' : 'All Sites'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden md:flex items-center gap-2 px-3 py-1.5 max-w-[170px] text-sm font-medium text-foreground bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors duration-200"
        >
          <BuildingRegular className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{selectedLabel}</span>
          <ChevronDownRegular className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60 max-h-80 overflow-y-auto">
        <DropdownMenuItem onClick={() => setSiteId(null)} className="flex items-center justify-between gap-2">
          <span>All Sites</span>
          {siteId === null && <CheckmarkRegular className="h-4 w-4 text-primary flex-shrink-0" />}
        </DropdownMenuItem>
        {sites.map((site) => (
          <DropdownMenuItem
            key={site.id}
            onClick={() => setSiteId(site.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{site.name}</span>
            {siteId === site.id && <CheckmarkRegular className="h-4 w-4 text-primary flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
        {sites.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground text-center">No sites found</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
