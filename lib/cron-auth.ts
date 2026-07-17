import { NextRequest } from 'next/server'

// Vercel's built-in Cron Jobs feature automatically sends
// `Authorization: Bearer $CRON_SECRET` on every scheduled invocation — there
// is no way to configure it to send a custom header instead. Checking
// anything else here means the route silently 401s on every real cron call.
export function isValidCronRequest(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
}
