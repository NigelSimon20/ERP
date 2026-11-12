import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import { SessionData, sessionOptions } from './session'

const IN_PROGRESS = 0
// A7: a key is remembered for 24 hours, then forgotten and pruned.
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

// P1-5 / A7: a client retrying a create (double-click, flaky network) sends
// the same Idempotency-Key and gets the original response back instead of a
// second document.
//   same key + same body      -> the stored response is replayed
//   same key + different body -> 422 IDEMPOTENCY_MISMATCH (also on another endpoint)
//   same key still running    -> 409 IDEMPOTENCY_IN_PROGRESS
//   no key                    -> the request runs exactly as before
export async function withIdempotency(
  req: NextRequest,
  companyId: string,
  route: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = req.headers.get('idempotency-key')
  if (!key) return handler()
  if (key.length > 200) {
    return NextResponse.json({ error: 'Idempotency-Key is too long', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  const body = await req.clone().text().catch(() => '')
  const requestHash = crypto.createHash('sha256').update(`${route}\n${body}`).digest('hex')
  const where = { companyId_route_key: { companyId, route, key } }
  const expired = new Date(Date.now() - IDEMPOTENCY_TTL_MS)
  await prisma.idempotencyKey.deleteMany({ where: { companyId, key, createdAt: { lt: expired } } })

  const replayOrRefuse = (existing: { route: string; requestHash: string | null; status: number; response: Prisma.JsonValue }) => {
    if (existing.route !== route || (existing.requestHash && existing.requestHash !== requestHash)) {
      return NextResponse.json({ error: 'This Idempotency-Key was already used for a different request', code: 'IDEMPOTENCY_MISMATCH' }, { status: 422 })
    }
    if (existing.status === IN_PROGRESS) {
      return NextResponse.json({ error: 'This request is already being processed', code: 'IDEMPOTENCY_IN_PROGRESS' }, { status: 409 })
    }
    return NextResponse.json(existing.response, { status: existing.status, headers: { 'Idempotent-Replay': 'true' } })
  }

  // The same key on another endpoint is a different request.
  const other = await prisma.idempotencyKey.findFirst({ where: { companyId, key, NOT: { route } } })
  if (other) return replayOrRefuse(other)

  // Reserve the key first, so two concurrent requests can't both run.
  try {
    await prisma.idempotencyKey.create({ data: { companyId, route, key, requestHash, status: IN_PROGRESS, response: {} } })
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    const existing = await prisma.idempotencyKey.findUnique({ where })
    if (!existing) return NextResponse.json({ error: 'This request is already being processed', code: 'IDEMPOTENCY_IN_PROGRESS' }, { status: 409 })
    return replayOrRefuse(existing)
  }

  let res: NextResponse
  try {
    res = await handler()
  } catch (err) {
    await prisma.idempotencyKey.delete({ where })
    throw err
  }
  if (res.status >= 500) {
    // Let the client retry a server failure with the same key.
    await prisma.idempotencyKey.delete({ where })
    return res
  }
  const stored = await res.clone().json().catch(() => null)
  await prisma.idempotencyKey.update({ where, data: { status: res.status, response: stored ?? {} } })
  return res
}

// For routes that read the session inside their handler: resolves the
// company from the session cookie; unauthenticated requests go straight to
// the handler, which answers 401 itself.
export async function idempotentPost(req: NextRequest, route: string, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn || !session.companyId) return handler()
  return withIdempotency(req, session.companyId, route, handler)
}

// Deletes keys older than the 24h window (run daily by the reconcile cron).
export async function pruneIdempotencyKeys(): Promise<number> {
  const r = await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } } })
  return r.count
}
