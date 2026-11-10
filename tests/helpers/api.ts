import { NextRequest } from 'next/server'
import { sealData } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { setTestCookie, cookieHeader, testRequest } from './cookies'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each route types its own params
type Handler = (req: NextRequest, ctx: any) => Promise<Response>

export async function loginAs(session: Partial<SessionData> | null) {
  if (!session) {
    setTestCookie(sessionOptions.cookieName, null)
    return
  }
  const sealed = await sealData(
    { isLoggedIn: true, issuedAt: Date.now(), checkedAt: Date.now(), ...session },
    { password: sessionOptions.password as string },
  )
  setTestCookie(sessionOptions.cookieName, sealed)
}

// Calls a route handler the way Next would, with the current test session.
export async function callRoute(
  handler: Handler,
  opts: { method?: string; path: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> },
) {
  const req = new NextRequest(new URL(opts.path, 'http://localhost:3000'), {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', cookie: cookieHeader(), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  testRequest.headers = req.headers
  const res = await handler(req, { params: opts.params ?? {} })
  const text = await res.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json, headers: res.headers }
}
