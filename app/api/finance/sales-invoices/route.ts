import { NextRequest, NextResponse } from 'next/server'
import { idempotentPost } from '@/lib/idempotency'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate, pageLimit } from '@/lib/utils'
import { nextInvoiceNumber } from '@/lib/auto-numbers'
import { calculateInvoiceLineTotal, calculateInvoiceTotals, determineInvoiceStatus, overdueQueryCutoff } from '@/lib/calculations'
import { recalculateCustomerOutstandingBalance } from '@/lib/finance-recalculation'
import { salesInvoiceSchema } from '@/lib/validators'
import { deriveInvoiceStatus, toDbInvoiceStatus, DB_STATUS_VOID } from '@/lib/invoice-status'
import { postSalesInvoiceToGL } from '@/lib/gl-posting'
import { apiError } from '@/lib/api-error'

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
      orderBy: [{ invoice_date: 'desc' }, { id: 'asc' }],
      ...paginate(page, pageLimit(searchParams)),
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
    currency: r.currency ?? undefined,
    totalAmount: Number(r.total_amount ?? 0),
    paidAmount: Number(r.amount_paid ?? 0),
    balanceDue: Number(r.balance_due ?? 0),
    status: deriveInvoiceStatus({ total: r.total_amount, paid: r.amount_paid, credited: r.credited_amount, dueDate: r.due_date, voided: r.status === DB_STATUS_VOID }),
    notes: r.overall_description,
    customer: { id: r.customer_id ?? '', name: (r.customer_id && customerMap[r.customer_id]) || r.customer_name || '' },
  }))

  // P1-7 (BUG-012/014): summary cards come from SQL over every matching
  // invoice, not from whichever page the browser happens to hold. Same
  // customer/date filters as the list; the status tab doesn't apply.
  const fromIso = from ? new Date(from).toISOString() : null
  const toIso = to ? new Date(to).toISOString() : null
  const [agg] = await prisma.$queryRaw<{ count: number; invoiced: unknown; paid: unknown; outstanding: unknown; overdue: unknown }[]>`
    SELECT count(*)::int AS count,
           COALESCE(sum(total_amount), 0) AS invoiced,
           COALESCE(sum(amount_paid), 0) AS paid,
           COALESCE(sum(GREATEST(COALESCE(total_amount, 0) - COALESCE(amount_paid, 0) - credited_amount, 0)), 0) AS outstanding,
           COALESCE(sum(CASE WHEN due_date < ${overdueCutoff} THEN GREATEST(COALESCE(total_amount, 0) - COALESCE(amount_paid, 0) - credited_amount, 0) END), 0) AS overdue
    FROM sales_invoices
    WHERE "companyId" = ${session.companyId} AND status IS DISTINCT FROM ${DB_STATUS_VOID}
      AND (${customerId ?? null}::text IS NULL OR customer_id = ${customerId ?? null}::text)
      AND (${fromIso}::text IS NULL OR invoice_date >= ${fromIso}::text)
      AND (${toIso}::text IS NULL OR invoice_date <= ${toIso}::text)`
  const summary = {
    count: agg.count,
    totalInvoiced: Number(agg.invoiced),
    totalPaid: Number(agg.paid),
    outstanding: Number(agg.outstanding),
    overdue: Number(agg.overdue),
  }

  return NextResponse.json({ invoices, total, page, summary })
}

async function createInvoice(req: NextRequest) {
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
        { error: `Period is locked until ${lockDate.lockedUntil.toLocaleDateString()}`, code: 'PERIOD_LOCKED' },
        { status: 422 },
      )
    }

    const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: session.companyId } })
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const invoiceNumber = await nextInvoiceNumber(session.companyId)

    const company = await prisma.company.findUnique({ where: { id: session.companyId }, select: { showVat: true, taxInclusive: true, receivablesAccountId: true, vatAccountId: true } })
    const taxEnabled = company?.showVat ?? true
    const taxInclusive = company?.taxInclusive ?? false

    const lines = (data.lineItems as { description: string; quantity: number; unitPrice: number; taxRate: number }[]).map((item) => {
      const taxRate = taxEnabled ? item.taxRate : 0
      const { lineTotal, taxAmount } = calculateInvoiceLineTotal(item.quantity, item.unitPrice, taxRate, taxInclusive)
      return { ...item, taxRate, lineTotal, taxAmount }
    })

    const { subTotal, taxTotal, totalAmount } = calculateInvoiceTotals(lines, 0, taxInclusive)
    const status = toDbInvoiceStatus(determineInvoiceStatus(totalAmount, 0, dueDate))

    // Explicit Company-level account mapping (Settings -> Company -> Tax)
    // replaces fuzzy account-name matching -- an invoice can no longer post
    // successfully while silently never reaching the GL.
    if (!company?.receivablesAccountId) {
      return NextResponse.json({ error: 'Accounts Receivable account is not configured. Set it in Settings → Company → Tax.' }, { status: 400 })
    }
    if ((taxTotal ?? 0) > 0 && !company.vatAccountId) {
      return NextResponse.json({ error: 'This invoice has tax, but no VAT Payable account is configured. Set it in Settings → Company → Tax.' }, { status: 400 })
    }

    const [receivablesAccount, revenueAccount] = await Promise.all([
      prisma.chartOfAccount.findFirst({ where: { id: company.receivablesAccountId, companyId: session.companyId } }),
      prisma.chartOfAccount.findFirst({ where: { id: data.revenueAccountId, companyId: session.companyId, account_type: 'REVENUE' } }),
    ])
    if (!receivablesAccount) {
      return NextResponse.json({ error: 'The configured Accounts Receivable account no longer exists. Re-select it in Settings → Company → Tax.' }, { status: 400 })
    }
    if (!revenueAccount) {
      return NextResponse.json({ error: 'Selected revenue account was not found' }, { status: 400 })
    }
    const vatAccount = company.vatAccountId
      ? await prisma.chartOfAccount.findFirst({ where: { id: company.vatAccountId, companyId: session.companyId } })
      : null

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.salesInvoice.create({
        data: {
          id: crypto.randomUUID(),
          companyId: session.companyId,
          customer_id: data.customerId,
          customer_name: customer.company_name ?? '',
          invoice_number: invoiceNumber,
          invoice_date: issueDate.toISOString(),
          due_date: dueDate.toISOString(),
          overall_description: data.description || data.notes || '',
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

      // receivablesAccount/revenueAccount are guaranteed resolved above --
      // this is no longer a silent skip, it's an unconditional post.
      {
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
    }, { timeout: 60000 })

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
        status: deriveInvoiceStatus({ total: invoice.total_amount, paid: invoice.amount_paid, dueDate: invoice.due_date, voided: invoice.status === DB_STATUS_VOID }),
        customer: { id: customer.id, name: customer.company_name ?? '' },
      },
    }, { status: 201 })
  } catch (err: unknown) {
    return apiError(err, 'Failed', 400)
  }
}

// A7: an Idempotency-Key makes a retried create return the first response
// instead of creating a second document; without one nothing changes.
export async function POST(req: NextRequest) {
  return idempotentPost(req, 'POST /api/finance/sales-invoices', () => createInvoice(req))
}
