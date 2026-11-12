import { vi } from 'vitest'
import { testCookies, testRequest } from '../helpers/cookies'

// Runs before every test file, before any app module (and so before the
// Prisma client) is imported. Without TEST_DATABASE_URL, Prisma would fall
// back to .env -- the real database.
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL
process.env.SESSION_PASSWORD = 'test-session-password-at-least-32-characters-long'
process.env.JWT_SECRET = 'test-jwt-secret'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
delete process.env.RESEND_API_KEY
delete process.env.BIRD_API_KEY
// Prisma loads .env into process.env for keys that aren't set, which would
// let the login route's Supabase Auth fallback reach the real project over
// the network (slow under load, and tests must never touch it). An empty
// value counts as set, so .env can't fill it in.
process.env.NEXT_PUBLIC_SUPABASE_URL = ''
process.env.SUPABASE_SERVICE_ROLE_KEY = ''

// Routes that read the session through next/headers' cookies() need a
// request scope Next only provides at runtime; serve the test's cookie.
vi.mock('next/headers', () => ({
  cookies: () => testCookies,
  headers: () => testRequest.headers,
}))
