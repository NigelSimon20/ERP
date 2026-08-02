import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { hexToHslTriplet } from '@/lib/color'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) redirect('/login')

  // The session cookie already carries id/name/email/role/companyId (see
  // SessionData in lib/session.ts) -- only the company's display name and
  // theme colors need a live DB read. This used to re-fetch the User row
  // too on every single navigation and, worse, let either query's failure
  // throw uncaught out of a Server Component wrapping the entire
  // authenticated app: a brief DB hiccup (this project's Supabase pooler is
  // documented as occasionally flaky) crashed every page, not just one,
  // with a raw error overlay. Now it degrades to the session's own values
  // and default styling instead.
  let companyName = ''
  const themeVars: Record<string, string> = {}
  try {
    const company = await prisma.company.findUnique({
      where: { id: session.companyId },
      select: { name: true, headerColor: true, sidebarColor: true, buttonColor: true },
    })
    companyName = company?.name ?? ''
    if (company?.headerColor) themeVars['--company-header'] = hexToHslTriplet(company.headerColor)
    if (company?.sidebarColor) themeVars['--company-sidebar'] = hexToHslTriplet(company.sidebarColor)
    if (company?.buttonColor) themeVars['--company-button'] = hexToHslTriplet(company.buttonColor)
  } catch (err) {
    console.error('DashboardLayout: failed to load company branding, using defaults', err)
  }

  return (
    <DashboardShell
      user={{
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        companyName,
      }}
      themeVars={themeVars}
    >
      {children}
    </DashboardShell>
  )
}
