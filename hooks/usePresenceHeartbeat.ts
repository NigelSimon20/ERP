'use client'

import { useEffect } from 'react'
import { HEARTBEAT_INTERVAL_MS } from '@/lib/presence'

// Pings the server every 30s while the dashboard is mounted, recording this
// user as "active" for the online/offline indicator in Messages. Runs
// app-wide (not just on the Messages page) so a user browsing elsewhere in
// the ERP still shows as online to a coworker messaging them.
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const ping = () => { fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {}) }
    ping()
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [enabled])
}
