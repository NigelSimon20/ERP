import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import crypto from 'crypto'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'VOID' | 'LOGIN' | 'LOGOUT' | 'VIEW' | 'EXPORT'

export interface AuditParams {
  companyId: string
  userId: string
  userName: string
  action: AuditAction
  module: string
  recordId?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  ipAddress?: string
}

// P1-9: who/where comes from the request itself, so every existing call
// records IP, user agent and request id without passing them in. Outside a
// request (cron, scripts) headers() throws and these stay null.
async function requestContext(): Promise<{ ip: string | null; userAgent: string | null; requestId: string | null }> {
  try {
    const { headers } = await import('next/headers')
    const h = headers()
    const fwd = h.get('x-forwarded-for')
    return {
      ip: fwd ? fwd.split(',')[0].trim() : h.get('x-real-ip'),
      userAgent: h.get('user-agent'),
      requestId: h.get('x-vercel-id') ?? h.get('x-request-id'),
    }
  } catch {
    return { ip: null, userAgent: null, requestId: null }
  }
}

function toPlain(v: unknown): unknown {
  return v === undefined ? null : JSON.parse(JSON.stringify(v))
}

// Changed keys only: { field: [before, after] }.
export function auditDiff(before?: Record<string, unknown>, after?: Record<string, unknown>): Record<string, [unknown, unknown]> | null {
  if (!before && !after) return null
  const b = (toPlain(before ?? {}) ?? {}) as Record<string, unknown>
  const a = (toPlain(after ?? {}) ?? {}) as Record<string, unknown>
  const out: Record<string, [unknown, unknown]> = {}
  for (const k of Array.from(new Set(Object.keys(b).concat(Object.keys(a))))) {
    if (k === 'updatedAt' || k === 'updated_date') continue
    if (JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)) out[k] = [b[k] ?? null, a[k] ?? null]
  }
  return out
}

async function buildRow(params: AuditParams) {
  const ctx = await requestContext()
  const changes = auditDiff(params.oldValues, params.newValues)
  return {
    id: crypto.randomUUID(),
    companyId: params.companyId,
    userId: params.userId,
    userName: params.userName,
    action: params.action,
    module: params.module,
    recordId: params.recordId,
    oldValues: params.oldValues !== undefined ? JSON.stringify(params.oldValues) : null,
    newValues: params.newValues !== undefined ? JSON.stringify(params.newValues) : null,
    ipAddress: params.ipAddress ?? ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
    changes: changes ? (changes as Prisma.InputJsonValue) : Prisma.JsonNull,
  }
}

/**
 * With `tx`, the audit row is part of the caller's transaction: if it can't
 * be written the change rolls back too (use for posts, voids, payments).
 * Without `tx`, a failed audit write is logged and never breaks the request.
 */
export async function logAudit(params: AuditParams, tx?: Prisma.TransactionClient): Promise<void> {
  const data = await buildRow(params)
  if (tx) {
    await tx.auditTrail.create({ data })
    return
  }
  try {
    await prisma.auditTrail.create({ data })
  } catch (err) {
    console.error('[audit] write failed', { module: params.module, recordId: params.recordId }, err)
  }
}
