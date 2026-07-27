import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { hexToHslTriplet } from '@/lib/color'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
    },
  })

  if (!user) redirect('/login')

  const companyId = user.companyId ?? session.companyId
  const company = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, headerColor: true, sidebarColor: true, buttonColor: true },
      })
    : null

  const themeVars: Record<string, string> = {}
  if (company?.headerColor) themeVars['--company-header'] = hexToHslTriplet(company.headerColor)
  if (company?.sidebarColor) themeVars['--company-sidebar'] = hexToHslTriplet(company.sidebarColor)
  if (company?.buttonColor) themeVars['--company-button'] = hexToHslTriplet(company.buttonColor)

  return (
    <DashboardShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: company?.name ?? '',
      }}
      themeVars={themeVars}
    >
      {children}
    </DashboardShell>
  )
}
