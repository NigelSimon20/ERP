import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  try {
    const res = NextResponse.redirect(new URL('/dashboard', req.url))
    const session = await getSession(req, res)

    const uid = new URL(req.url).searchParams.get('uid') || process.env.DEV_TEST_USER_ID
    const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null

    const s: any = session
    if (user) {
      // Log in as the real user so companyId/role/guardId/customerId match the DB.
      s.userId = user.id
      s.companyId = user.companyId
      s.name = user.name
      s.email = user.email
      s.role = user.role
      s.guardId = user.guardId ?? undefined
      s.customerId = user.customerId ?? undefined
    } else {
      // Fall back to a fully synthetic session when no matching user exists.
      s.userId = uid || 'dev-test-user'
      s.companyId = process.env.DEV_TEST_COMPANY_ID || ''
      s.name = 'Dev Tester'
      s.email = 'dev@test.local'
      s.role = 'ADMIN'
    }
    s.isLoggedIn = true
    s.issuedAt = Date.now()
    s.checkedAt = Date.now()

    await s.save()
    return res
  } catch (err) {
    console.error('dev-login error:', err)
    return NextResponse.json({ error: 'Failed to set dev session' }, { status: 500 })
  }
}
