'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { SearchRegular } from '@fluentui/react-icons'
import { PortalCard, type PortalCardData } from '@/components/portals/PortalCard'
import { EmbeddedPortalModal } from '@/components/portals/EmbeddedPortalModal'
import { CATEGORY_LABELS } from '@/lib/portals'

interface Portal extends PortalCardData {
  url: string
}

export default function ExternalPortalsPage() {
  const router = useRouter()
  const [portals, setPortals] = useState<Portal[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [embed, setEmbed] = useState<{ name: string; url: string } | null>(null)

  useEffect(() => {
    fetch('/api/portals')
      .then((r) => r.json())
      .then((j) => setPortals(j.portals ?? []))
      .catch(() => toast.error('Failed to load portals'))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(portals.map((p) => p.category))),
    [portals],
  )

  const filtered = useMemo(() => portals.filter((p) => {
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter
    const matchesSearch = !search
      || p.name.toLowerCase().includes(search.toLowerCase())
      || p.description.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  }), [portals, categoryFilter, search])

  async function handleOpen(portal: Portal) {
    fetch(`/api/portals/${portal.id}/launch`, { method: 'POST' }).catch(() => {})

    if (portal.openBehavior === 'EMBEDDED') {
      setEmbed({ name: portal.name, url: portal.url })
    } else if (portal.openBehavior === 'SAME_TAB') {
      if (portal.url.startsWith('/')) router.push(portal.url)
      else window.location.href = portal.url
    } else {
      window.open(portal.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">External Portals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your enterprise portal hub — internal self-service and external partner/government portals in one place</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <SearchRegular className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted-light" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search portals…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Search portals"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${categoryFilter === 'ALL' ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(c)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${categoryFilter === c ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading portals…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No portals match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((p) => (
            <PortalCard key={p.id} portal={p} onOpen={() => handleOpen(p)} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <strong>Note:</strong> You only see portals your role has been granted access to.
        Manage portals, branding, and permissions from <Link href="/settings/company" className="underline">Settings → Company → Portals</Link>.
      </div>

      {embed && (
        <EmbeddedPortalModal
          portalName={embed.name}
          url={embed.url}
          open={!!embed}
          onOpenChange={(open) => { if (!open) setEmbed(null) }}
        />
      )}
    </div>
  )
}
