// A user counts as online if their last heartbeat was within this window.
// The client pings every HEARTBEAT_INTERVAL_MS below — pick a threshold
// with enough slack for a couple of missed/delayed pings (tab throttling,
// brief network blips) without flapping the indicator.
export const ONLINE_THRESHOLD_MS = 90_000
export const HEARTBEAT_INTERVAL_MS = 30_000

export function isOnline(lastActiveAt: Date | string | null | undefined): boolean {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
}
