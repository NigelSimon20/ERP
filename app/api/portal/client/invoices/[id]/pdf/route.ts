import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientSession } from '@/lib/portal-auth'

// Same raw shape as the staff-side GET .../sales-invoices/[id]?action=pdf
// (the exportDocumentPdf('invoice', ...) helper in lib/pdf.ts expects the
// raw SalesInvoice record + lineItems), but scoped to the logged-in
// client's own customerId -- a customer could never view another
// customer's invoice PDF by guessing an id.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getClientSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.customerId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: params.id, companyId: session.companyId, customer_id: session.customerId },
    include: { lineItems: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ invoice })
}
