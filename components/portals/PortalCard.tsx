'use client'

import { OpenRegular, PeopleRegular } from '@fluentui/react-icons'
import { PortalIcon } from '@/lib/portal-icons'
import { CATEGORY_BADGE, CATEGORY_LABELS } from '@/lib/portals'
import { timeAgo } from '@/lib/utils'

export interface PortalCardData {
  id: string
  name: string
  category: string
  description: string
  logoUrl?: string | null
  icon?: string | null
  colorPrimary?: string | null
  buttonText: string
  openBehavior: string
  isActive: boolean
  eligibleUserCount?: number
  lastAccessedByMe?: string | Date | null
}

export function PortalCard({
  portal, onOpen, showStatus = false,
}: { portal: PortalCardData; onOpen?: () => void; showStatus?: boolean }) {
  const chipColor = portal.colorPrimary || '#DC2626'

  return (
    <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div
          className="rounded-lg p-3 flex items-center justify-center"
          style={{ backgroundColor: `${chipColor}1A` }}
        >
          <PortalIcon
            icon={portal.icon}
            logoUrl={portal.logoUrl}
            alt={portal.name}
            className="h-7 w-7 object-contain"
          />
        </div>
        <div className="flex items-center gap-2">
          {showStatus && (
            <span className={`h-2 w-2 rounded-full ${portal.isActive ? 'bg-green-500' : 'bg-muted-foreground/40'}`} title={portal.isActive ? 'Active' : 'Inactive'} />
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_BADGE[portal.category] ?? 'bg-muted text-muted-foreground'}`}>
            {CATEGORY_LABELS[portal.category] ?? portal.category}
          </span>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground">{portal.name}</h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{portal.description}</p>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        {typeof portal.eligibleUserCount === 'number' && (
          <div className="flex items-center gap-2">
            <PeopleRegular className="h-4 w-4 text-brand-muted-light" />
            <span><strong>{portal.eligibleUserCount}</strong> authorised {portal.eligibleUserCount === 1 ? 'user' : 'users'}</span>
          </div>
        )}
        {portal.lastAccessedByMe && (
          <div className="text-xs text-brand-muted-light">Last opened {timeAgo(portal.lastAccessedByMe)}</div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg text-white text-sm font-medium px-4 py-2.5 transition-colors hover:brightness-90"
        style={{ backgroundColor: chipColor }}
      >
        {portal.buttonText}
        {portal.openBehavior !== 'SAME_TAB' && <OpenRegular className="h-4 w-4" />}
      </button>
    </div>
  )
}
