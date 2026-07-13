import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ results: {} })

  const cid = session.companyId
  const mode = 'insensitive' as const

  const siteIds = (
    await prisma.site.findMany({ select: { id: true } })
  ).map(s => s.id)

  const [guards, sites, customers, invoices, incidents] = await Promise.all([
    prisma.guard.findMany({
      where: {
        companyId: cid,
        OR: [{ full_name: { contains: q, mode } }, { employee_code: { contains: q, mode } }],
      },
      select: { id: true, full_name: true, employee_code: true, status: true },
      take: 5,
    }),
    prisma.site.findMany({
      where: { site_name: { contains: q, mode } },
      select: { id: true, site_name: true, address: true, status: true },
      take: 5,
    }),
    prisma.customer.findMany({
      where: { company_name: { contains: q, mode } },
      select: { id: true, company_name: true, email: true },
      take: 5,
    }),
    prisma.salesInvoice.findMany({
      where: { invoice_number: { contains: q, mode } },
      select: { id: true, invoice_number: true, status: true, total_amount: true },
      take: 5,
    }),
    siteIds.length
      ? prisma.incident.findMany({
          where: { siteId: { in: siteIds }, title: { contains: q, mode } },
          select: { id: true, title: true, severity: true, status: true },
          take: 5,
        })
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    results: {
      ...(guards.length && {
        Guards: guards.map(g => ({
          id: g.id,
          label: g.full_name,
          sub: g.employee_code,
          href: `/human-resources/employees/${g.id}`,
        })),
      }),
      ...(sites.length && {
        Sites: sites.map(s => ({
          id: s.id,
          label: s.site_name,
          sub: s.address,
          href: `/operations/sites/${s.id}`,
        })),
      }),
      ...(customers.length && {
        Customers: customers.map(c => ({
          id: c.id,
          label: c.company_name,
          sub: c.email ?? '',
          href: `/finance/customers/${c.id}`,
        })),
      }),
      ...(invoices.length && {
        Invoices: invoices.map(i => ({
          id: i.id,
          label: i.invoice_number,
          sub: i.status,
          href: `/finance/sales-invoices/${i.id}`,
        })),
      }),
      ...(incidents.length && {
        Incidents: incidents.map(i => ({
          id: i.id,
          label: i.title,
          sub: i.severity,
          href: `/operations/incidents/${i.id}`,
        })),
      }),
    },
  })
}
