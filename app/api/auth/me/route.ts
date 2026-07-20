import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)

  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      phone: true,
      whatsapp: true,
      avatar: true,
      active: true,
      mustChangePassword: true,
      lastLogin: true,
      companyId: true,
      guardId: true,
      customerId: true,
      company: {
        select: {
          id: true,
          name: true,
          currency: true,
          logo: true,
          defaultVatRate: true,
          taxName: true,
          vatNumber: true,
          showVat: true,
          taxInclusive: true,
          taxAppliedByDefault: true,
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const responseUser = {
    ...user,
    company: user.company
      ? {
          id: user.company.id,
          name: user.company.name,
          currency: user.company.currency,
          logo: user.company.logo,
          taxRate: user.company.defaultVatRate,
          taxName: user.company.taxName ?? 'VAT',
          taxNumber: user.company.vatNumber,
          taxEnabled: user.company.showVat ?? true,
          taxInclusive: user.company.taxInclusive ?? false,
          taxAppliedByDefault: user.company.taxAppliedByDefault ?? true,
        }
      : null,
  }

  return NextResponse.json({ user: responseUser })
}
