import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import dns from 'dns/promises'
import crypto from 'crypto'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']

// Portal URLs are admin-supplied, so a "test connection" button is a classic
// SSRF vector — block anything that resolves to a loopback/private/link-local
// address before the server-side fetch, since only http(s) to the public
// internet is a legitimate use case here.
function isPrivateOrLoopback(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return true
  if (/^10\./.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true
  if (/^169\.254\./.test(ip)) return true
  if (/^fc[0-9a-f]{2}:/i.test(ip) || /^fd[0-9a-f]{2}:/i.test(ip)) return true
  if (/^fe80:/i.test(ip)) return true
  return false
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const portal = await prisma.portal.findFirst({ where: { id, companyId: session.companyId } })
  if (!portal) return NextResponse.json({ error: 'Portal not found' }, { status: 404 })

  let parsed: URL
  try {
    parsed = new URL(portal.url)
  } catch {
    return NextResponse.json({ ok: false, error: 'Portal URL is not a valid URL' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ ok: false, error: 'Only http/https URLs can be tested' }, { status: 400 })
  }
  if (parsed.hostname === 'localhost') {
    return NextResponse.json({ ok: false, error: 'Local addresses are not allowed' }, { status: 400 })
  }
  try {
    const { address } = await dns.lookup(parsed.hostname)
    if (isPrivateOrLoopback(address)) {
      return NextResponse.json({ ok: false, error: 'Private/internal addresses are not allowed' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not resolve host' }, { status: 400 })
  }

  const start = Date.now()
  let ok = false
  let status: number | null = null
  let error: string | null = null
  try {
    let res = await fetch(parsed.toString(), { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(parsed.toString(), { method: 'GET', signal: AbortSignal.timeout(5000), redirect: 'follow' })
    }
    status = res.status
    ok = res.status < 500
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : 'Request failed'
  }
  const latencyMs = Date.now() - start

  await prisma.portalUsageLog.create({
    data: { id: crypto.randomUUID(), portalId: id, userId: session.userId, action: 'TEST_CONNECTION' },
  })

  return NextResponse.json({ ok, status, latencyMs, error })
}
