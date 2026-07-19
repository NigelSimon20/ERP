'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OpenRegular, WarningRegular } from '@fluentui/react-icons'

export function EmbeddedPortalModal({
  portalName, url, open, onOpenChange,
}: { portalName: string; url: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!open) { setLoaded(false); setSlow(false); return }
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>{portalName}</DialogTitle>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Open in new tab <OpenRegular className="h-3.5 w-3.5" />
            </a>
          </div>
        </DialogHeader>

        <div className="relative flex-1">
          {slow && !loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card text-center px-8">
              <WarningRegular className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-muted-foreground max-w-sm">
                This site is taking a while to load here — some external portals block being embedded for security reasons.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-brand-red-dark text-white text-sm font-medium px-4 py-2"
              >
                Open in new tab instead <OpenRegular className="h-4 w-4" />
              </a>
            </div>
          )}
          <iframe
            src={url}
            title={portalName}
            className="w-full h-full border-0"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
