import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  try {
    const res = NextResponse.redirect(new URL('/dashboard', req.url))
    const session = await getSession(req, res)

    // Lightweight dev session — adjust IDs to match your DB if needed
    const uid = new URL(req.url).searchParams.get('uid') || process.env.DEV_TEST_USER_ID
    const s: any = session
    s.userId = uid || 'dev-test-user'
    s.companyId = process.env.DEV_TEST_COMPANY_ID || ''
    s.name = 'Dev Tester'
    s.email = 'dev@test.local'
    s.role = 'ADMIN'
    s.isLoggedIn = true

    await s.save()
    return res
  } catch (err) {
    console.error('dev-login error:', err)
    return NextResponse.json({ error: 'Failed to set dev session' }, { status: 500 })
  }
}
