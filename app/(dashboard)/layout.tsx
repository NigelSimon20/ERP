import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { DashboardShell } from '@/components/layout/DashboardShell'

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
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
    : null

  return (
    <DashboardShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: company?.name ?? '',
      }}
    >
      {children}
    </DashboardShell>
  )
}
