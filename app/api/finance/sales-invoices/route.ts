import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'
import { nextInvoiceNumber } from '@/lib/auto-numbers'
import { calculateInvoiceLineTotal, calculateInvoiceTotals, determineInvoiceStatus, overdueQueryCutoff } from '@/lib/calculations'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { salesInvoiceSchema } from '@/lib/validators'
import { fromDbInvoiceStatus, toDbInvoiceStatus } from '@/lib/invoice-status'
import { postSalesInvoiceToGL } from '@/lib/gl-posting'

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
  const overdueCutoff = overdueQueryCutoff().toISOString()

  const statusFilter: any =
    status === 'OVERDUE' ? { status: 'Sent', due_date: { lt: overdueCutoff }, balance_due: { gt: 0 } }
    : status === 'UNPAID' ? { status: 'Sent', OR: [{ due_date: { gte: overdueCutoff } }, { due_date: null }, { balance_due: { lte: 0 } }] }
    : status ? { status: toDbInvoiceStatus(status) }
    : {}

  const where: any = {
    companyId: session.companyId,
    ...statusFilter,
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

  const [rows, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: where as any,
      orderBy: { invoice_date: 'desc' },
      ...paginate(page),
    }),
    prisma.salesInvoice.count({ where: where as any }),
  ])

  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[]
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, company_name: true } })
    : []
  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c.company_name]))

  const invoices = rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    issueDate: r.invoice_date,
    dueDate: r.due_date,
    totalAmount: Number(r.total_amount ?? 0),
    paidAmount: Number(r.amount_paid ?? 0),
    balanceDue: Number(r.balance_due ?? 0),
    status: fromDbInvoiceStatus(r.status, r.due_date, Number(r.balance_due ?? 0)),
    notes: r.overall_description,
    customer: { id: r.customer_id ?? '', name: (r.customer_id && customerMap[r.customer_id]) || r.customer_name || '' },
  }))

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
    const status = toDbInvoiceStatus(determineInvoiceStatus(totalAmount, 0, dueDate))

    const [receivablesAccount, vatAccount, requestedRevenueAccount, defaultRevenueAccount] = await Promise.all([
      prisma.chartOfAccount.findFirst({ where: { companyId: session.companyId, account_type: 'ASSET', account_name: { contains: 'Accounts Receivable' } } }),
      prisma.chartOfAccount.findFirst({ where: { companyId: session.companyId, account_type: 'LIABILITY', account_name: { contains: 'VAT' } } }),
      data.revenueAccountId
        ? prisma.chartOfAccount.findFirst({ where: { id: data.revenueAccountId, companyId: session.companyId, account_type: 'REVENUE' } })
        : Promise.resolve(null),
      prisma.chartOfAccount.findFirst({ where: { companyId: session.companyId, account_type: 'REVENUE' }, orderBy: { account_code: 'asc' } }),
    ])
    const revenueAccount = requestedRevenueAccount ?? defaultRevenueAccount

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          customer_id: data.customerId,
          invoice_number: invoiceNumber,
          invoice_date: issueDate.toISOString(),
          due_date: dueDate.toISOString(),
          overall_description: data.description ?? '',
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

      if (receivablesAccount && revenueAccount) {
        await postSalesInvoiceToGL(tx, {
          companyId: session.companyId,
          invoiceId: inv.id,
          invoiceNumber,
          entryDate: issueDate.toISOString(),
          subtotal: subTotal ?? 0,
          taxAmount: taxTotal ?? 0,
          totalAmount,
          receivablesAccountId: receivablesAccount.id,
          revenueAccountId: revenueAccount.id,
          vatAccountId: vatAccount?.id ?? null,
          userId: session.userId,
        })
      }

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

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        issueDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        totalAmount: Number(invoice.total_amount ?? 0),
        paidAmount: Number(invoice.amount_paid ?? 0),
        balanceDue: Number(invoice.balance_due ?? 0),
        status: fromDbInvoiceStatus(invoice.status, invoice.due_date, Number(invoice.balance_due ?? 0)),
        customer: { id: customer.id, name: customer.company_name ?? '' },
      },
    }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
