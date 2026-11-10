import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'

export interface ApiErrorBody {
  error: string
  code: string
  requestId: string
  fields?: Record<string, string>
}

// Anything that smells of the data layer is never shown to the client --
// e.g. "Invalid `prisma.lockDate.findFirst()` invocation ... companyId".
const INTERNAL_TEXT = /prisma|invocation|constraint|relation "|column "|\bP[0-9]{4}\b|ECONNREFUSED|\bSQL\b/i

function classify(err: unknown, fallback: string, status: number): { status: number; body: Omit<ApiErrorBody, 'requestId'> } {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_'
      fields[key] ??= issue.message
    }
    const first = err.issues[0]
    const where = first?.path.length ? `${first.path.join('.')}: ` : ''
    return { status: 400, body: { error: `${where}${first?.message ?? 'Invalid request'}`, code: 'VALIDATION_ERROR', fields } }
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': return { status: 409, body: { error: 'A record with these details already exists', code: 'DUPLICATE' } }
      case 'P2003': return { status: 400, body: { error: 'A referenced record does not exist', code: 'INVALID_REFERENCE' } }
      case 'P2025': return { status: 404, body: { error: 'Record not found', code: 'NOT_FOUND' } }
      case 'P2000': return { status: 400, body: { error: 'A value is too long', code: 'INVALID_INPUT' } }
      default: return { status: 500, body: { error: 'Something went wrong. Try again.', code: 'INTERNAL_ERROR' } }
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    // Bad input that reached the query (invalid date, wrong type, ...).
    return { status: 400, body: { error: 'Some values are invalid. Check the form and try again.', code: 'INVALID_INPUT' } }
  }
  if (err instanceof Prisma.PrismaClientInitializationError || err instanceof Prisma.PrismaClientRustPanicError || err instanceof Prisma.PrismaClientUnknownRequestError) {
    return { status: 500, body: { error: 'Something went wrong. Try again.', code: 'INTERNAL_ERROR' } }
  }
  if (err instanceof SyntaxError) {
    return { status: 400, body: { error: 'The request body is not valid JSON', code: 'INVALID_JSON' } }
  }
  // Plain `new Error('Insufficient stock')` from business logic is meant for
  // the user; TypeError/RangeError/etc. are bugs and stay server-side.
  if (err instanceof Error && err.constructor === Error && err.message && !INTERNAL_TEXT.test(err.message)) {
    return { status, body: { error: err.message, code: 'REQUEST_FAILED' } }
  }
  return { status: status >= 500 ? status : 500, body: { error: fallback, code: 'INTERNAL_ERROR' } }
}

// Use in every route catch block instead of returning err.message.
export function apiError(err: unknown, fallback = 'Request failed', status = 400, context?: string) {
  const requestId = crypto.randomUUID()
  const { status: code, body } = classify(err, fallback, status)
  console.error(`[api-error ${requestId}]${context ? ` ${context}` : ''}`, err)
  return NextResponse.json({ ...body, requestId } satisfies ApiErrorBody, { status: code, headers: { 'Cache-Control': 'private, no-store' } })
}
