import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const IN_PROGRESS = 0

// P1-5 (BUG-008): a client retrying a create (double-click, flaky network)
// sends the same Idempotency-Key and gets the original response back rather
// than a second receipt or invoice. Requests without the header run as usual.
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
  const where = { companyId_route_key: { companyId, route, key } }

  // Reserve the key first, so two concurrent requests can't both run.
  try {
    await prisma.idempotencyKey.create({ data: { companyId, route, key, status: IN_PROGRESS, response: {} } })
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    const existing = await prisma.idempotencyKey.findUnique({ where })
    if (!existing || existing.status === IN_PROGRESS) {
      return NextResponse.json({ error: 'This request is already being processed', code: 'IDEMPOTENCY_IN_PROGRESS' }, { status: 409 })
    }
    return NextResponse.json(existing.response, { status: existing.status, headers: { 'Idempotent-Replay': 'true' } })
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
  const body = await res.clone().json().catch(() => null)
  await prisma.idempotencyKey.update({ where, data: { status: res.status, response: body ?? {} } })
  return res
}
