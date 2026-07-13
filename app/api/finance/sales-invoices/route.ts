import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'
import { nextInvoiceNumber } from '@/lib/auto-numbers'
import { calculateInvoiceLineTotal, calculateInvoiceTotals, determineInvoiceStatus } from '@/lib/calculations'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { salesInvoiceSchema } from '@/lib/validators'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const customerId = searchParams.get('customerId') || undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Number(searchParams.get('page') ?? '1')

  const where: any = {
    companyId: session.companyId,
    ...(status && { status }),
    ...(customerId && { customer_id: customerId }),
    ...(from || to
      ? {
          invoice_date: {
            ...(from && { gte: new Date(from).toISOString() }),
            ...(to && { lte: new Date(to).toISOString() }),
          },
        }
      : {}),
  }

  const [invoices, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: where as any,
      orderBy: { invoice_date: 'desc' },
      ...paginate(page),
    }),
    prisma.salesInvoice.count({ where: where as any }),
  ])

  return NextResponse.json({ invoices, total, page })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = salesInvoiceSchema.parse(await req.json())

    const issueDate = new Date(data.issueDate as string)
    const dueDate = new Date(data.dueDate as string)

    if (issueDate >= dueDate) {
      return NextResponse.json({ error: 'Issue date must be before due date' }, { status: 400 })
    }

    const lockDate = await prisma.lockDate.findFirst({
      where: { companyId: session.companyId, lockedUntil: { gte: issueDate } },
    })
    if (lockDate) {
      return NextResponse.json(
        { error: `Period is locked until ${lockDate.lockedUntil.toLocaleDateString()}` },
        { status: 422 },
      )
    }

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: session.companyId } })
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const invoiceNumber = await nextInvoiceNumber(session.companyId)

    const lines = (data.lineItems as { description: string; quantity: number; unitPrice: number; taxRate: number }[]).map((item) => {
      const { lineTotal, taxAmount } = calculateInvoiceLineTotal(item.quantity, item.unitPrice, item.taxRate)
      return { ...item, lineTotal, taxAmount }
    })

    const { subTotal, taxTotal, totalAmount } = calculateInvoiceTotals(lines)
    const status = determineInvoiceStatus(totalAmount, 0, dueDate)

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          customer_id: data.customerId,
          invoice_number: invoiceNumber,
          invoice_date: issueDate.toISOString(),
          due_date: dueDate.toISOString(),
          overall_description: data.notes ?? '',
          subtotal: subTotal,
          tax_amount: taxTotal,
          total_amount: totalAmount,
          amount_paid: 0,
          balance_due: totalAmount,
          status: status,
        },
      })

      await tx.salesInvoiceLine.createMany({
        data: lines.map((l) => ({
          id: crypto.randomUUID(),
          salesInvoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
          lineTotal: l.lineTotal,
        })),
      })

      await recalculateCustomerOutstandingBalance(tx, data.customerId)

      return inv
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'SalesInvoices',
      recordId: invoice.id,
      newValues: { invoiceNumber, customer: customer?.company_name ?? '', totalAmount },
    })

    return NextResponse.json({ invoice }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
