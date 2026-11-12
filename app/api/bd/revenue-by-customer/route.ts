import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { NOT_VOID } from '@/lib/invoice-status'

// Feeds the BD Reports "Revenue by Customer" chart. Previously called the
// nonexistent /api/finance/invoices (404, masked by middleware's 403 for
// non-Finance roles before the missing route was ever reached) -- BD needs
// per-customer revenue totals, not the full SalesInvoice record set that
// /api/finance/sales-invoices returns and BD_MANAGER can't reach anyway.
export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const invoices = await prisma.salesInvoice.findMany({
    where: { companyId: session.companyId, status: NOT_VOID },
    select: { customer_id: true, total_amount: true },
  })

  const customerIds = Array.from(new Set(invoices.map((i) => i.customer_id).filter((v): v is string => !!v)))
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, company_name: true },
  })
  const nameById = new Map(customers.map((c) => [c.id, c.company_name]))

  return NextResponse.json({
    invoices: invoices
      .filter((i) => i.customer_id)
      .map((i) => ({
        customerId: i.customer_id as string,
        totalAmount: Number(i.total_amount ?? 0),
        customer: nameById.has(i.customer_id as string) ? { name: nameById.get(i.customer_id as string) } : null,
      })),
  })
}
