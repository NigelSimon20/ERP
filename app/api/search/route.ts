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

  const [
    guards, sites, customers, invoices, incidents,
    users, suppliers, tasks, leads, equipment, purchaseInvoices,
  ] = await Promise.all([
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
      where: { companyId: cid, company_name: { contains: q, mode } },
      select: { id: true, company_name: true, email: true },
      take: 5,
    }),
    prisma.salesInvoice.findMany({
      where: { companyId: cid, invoice_number: { contains: q, mode } },
      select: { id: true, invoice_number: true, status: true, total_amount: true },
      take: 5,
    }),
    prisma.incident.findMany({
      where: { title: { contains: q, mode } },
      select: { id: true, title: true, severity: true, status: true },
      take: 5,
    }),
    prisma.user.findMany({
      where: {
        companyId: cid,
        OR: [{ name: { contains: q, mode } }, { email: { contains: q, mode } }],
      },
      select: { id: true, name: true, email: true, role: true },
      take: 5,
    }),
    prisma.supplier.findMany({
      where: { companyId: cid, company_name: { contains: q, mode } },
      select: { id: true, company_name: true, contact_person: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: { companyId: cid, title: { contains: q, mode } },
      select: { id: true, title: true, status: true, priority: true },
      take: 5,
    }),
    prisma.lead.findMany({
      where: {
        companyId: cid,
        OR: [{ companyName: { contains: q, mode } }, { contactName: { contains: q, mode } }],
      },
      select: { id: true, companyName: true, status: true },
      take: 5,
    }),
    prisma.equipment.findMany({
      where: {
        OR: [{ equipment_name: { contains: q, mode } }, { equipment_code: { contains: q, mode } }],
      },
      select: { id: true, equipment_name: true, equipment_code: true, category: true },
      take: 5,
    }),
    prisma.purchaseInvoice.findMany({
      where: { companyId: cid, invoiceNumber: { contains: q, mode } },
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true },
      take: 5,
    }),
  ])

  // Note: only Sales Invoices has a dedicated per-record detail page today —
  // every other module links to its list page (no `[id]` route exists yet
  // for Guards, Sites, Customers, Incidents, Suppliers, Tasks, Leads,
  // Equipment, Purchase Invoices, or Users), so we don't fabricate a 404.
  return NextResponse.json({
    results: {
      ...(guards.length && {
        Guards: guards.map(g => ({
          id: g.id,
          label: g.full_name ?? 'Unnamed guard',
          sub: g.employee_code ?? g.status ?? '',
          href: `/human-resources/employees`,
        })),
      }),
      ...(sites.length && {
        Sites: sites.map(s => ({
          id: s.id,
          label: s.site_name ?? 'Unnamed site',
          sub: s.address ?? '',
          href: `/operations/sites`,
        })),
      }),
      ...(customers.length && {
        Customers: customers.map(c => ({
          id: c.id,
          label: c.company_name ?? 'Unnamed customer',
          sub: c.email ?? '',
          href: `/finance/customers`,
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
          href: `/operations/incidents`,
        })),
      }),
      ...(users.length && {
        Users: users.map(u => ({
          id: u.id,
          label: u.name,
          sub: `${u.role.replace(/_/g, ' ')} · ${u.email}`,
          href: `/settings/users`,
        })),
      }),
      ...(suppliers.length && {
        Suppliers: suppliers.map(s => ({
          id: s.id,
          label: s.company_name ?? 'Unnamed supplier',
          sub: s.contact_person ?? '',
          href: `/finance/suppliers`,
        })),
      }),
      ...(tasks.length && {
        Tasks: tasks.map(t => ({
          id: t.id,
          label: t.title,
          sub: `${t.status} · ${t.priority}`,
          href: `/tasks-requests/tasks`,
        })),
      }),
      ...(leads.length && {
        Leads: leads.map(l => ({
          id: l.id,
          label: l.companyName,
          sub: l.status,
          href: `/business-development/leads`,
        })),
      }),
      ...(equipment.length && {
        Equipment: equipment.map(e => ({
          id: e.id,
          label: e.equipment_name ?? 'Unnamed item',
          sub: e.equipment_code ?? e.category ?? '',
          href: `/operations/equipment`,
        })),
      }),
      ...(purchaseInvoices.length && {
        'Purchase Invoices': purchaseInvoices.map(p => ({
          id: p.id,
          label: p.invoiceNumber,
          sub: p.status,
          href: `/finance/purchase-invoices`,
        })),
      }),
    },
  })
}
