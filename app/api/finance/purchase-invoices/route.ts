import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { paginate } from '@/lib/utils'
import { calculateInvoiceLineTotal, calculateInvoiceTotals, determineInvoiceStatus } from '@/lib/calculations'
import { recalculateSupplierOutstandingBalance } from '@/lib/finance-recalculation'
import { nextPurchaseInvoiceNumber } from '@/lib/auto-numbers'
import { postPurchaseInvoiceToGL } from '@/lib/gl-posting'

async function getSession(req: NextRequest) {
  const res = NextResponse.next()
  const s = await getIronSession<SessionData>(req, res, sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? 1)
  const status = searchParams.get('status')
  const supplierId = searchParams.get('supplierId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const { companyId } = session

  const where: any = {
    companyId,
    ...(status && { status }),
    ...(supplierId && { supplierId }),
    ...(from || to) && {
      issueDate: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    },
  }

  const [invoices, total, summary] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: where as any,
      include: { supplier: { select: { id: true, company_name: true } } },
      orderBy: { issueDate: 'desc' },
      ...paginate(page),
    }),
    prisma.purchaseInvoice.count({ where: where as any }),
    prisma.purchaseInvoice.aggregate({
      where: { companyId, status: { not: 'VOID' } as any },
      _sum: { totalAmount: true, paidAmount: true, balanceDue: true },
    }),
  ])

  const overdueSum = await prisma.purchaseInvoice.aggregate({
    where: { companyId, status: 'OVERDUE' as any },
    _sum: { balanceDue: true },
  })

  return NextResponse.json({
    invoices: invoices.map((i) => ({
      id: i.id,
      billNumber: i.invoiceNumber,
      reference: i.reference,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      totalAmount: Number(i.totalAmount),
      paidAmount: Number(i.paidAmount),
      balanceDue: Number(i.balanceDue),
      status: i.status,
      notes: i.notes,
      supplier: { id: i.supplier.id, name: i.supplier.company_name ?? '' },
    })),
    total,
    page,
    summary: {
      totalInvoiced: Number(summary._sum.totalAmount ?? 0),
      totalPaid: Number(summary._sum.paidAmount ?? 0),
      outstanding: Number(summary._sum.balanceDue ?? 0),
      overdue: Number(overdueSum._sum.balanceDue ?? 0),
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { supplierId, issueDate, dueDate, description, lineItems, notes, reference, expenseAccountId } = body
  const { companyId } = session

  if (!supplierId || !issueDate || !dueDate) return NextResponse.json({ error: 'supplierId, issueDate, dueDate required' }, { status: 400 })
  if (!lineItems || lineItems.length === 0) return NextResponse.json({ error: 'At least one line item required' }, { status: 400 })

  const issue = new Date(issueDate)
  const due = new Date(dueDate)
  if (due <= issue) return NextResponse.json({ error: 'Due date must be after issue date' }, { status: 400 })

  const lock = await prisma.lockDate.findFirst({ where: { companyId, lockedUntil: { gte: issue } } })
  if (lock) return NextResponse.json({ error: `Period is locked until ${lock.lockedUntil.toISOString().split('T')[0]}` }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, companyId } })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

  const lines = lineItems.map((l: { description: string; quantity: number; unitPrice: number; taxRate?: number }) => {
    const lineTotal = calculateInvoiceLineTotal(l.quantity, l.unitPrice, l.taxRate ?? 0)
    return { ...l, ...lineTotal }
  })
  const totals = calculateInvoiceTotals(lines)
  const billNumber = await nextPurchaseInvoiceNumber(companyId)
  const status = determineInvoiceStatus(totals.totalAmount, 0, due)
  const id = crypto.randomUUID()

  const [payableAccount, requestedExpenseAccount, defaultExpenseAccount] = await Promise.all([
    prisma.chartOfAccount.findFirst({ where: { companyId, account_type: 'LIABILITY', account_name: { contains: 'Accounts Payable' } } }),
    expenseAccountId
      ? prisma.chartOfAccount.findFirst({ where: { id: expenseAccountId, companyId, account_type: 'EXPENSE' } })
      : Promise.resolve(null),
    prisma.chartOfAccount.findFirst({ where: { companyId, account_type: 'EXPENSE' }, orderBy: { account_code: 'asc' } }),
  ])
  const expenseAccount = requestedExpenseAccount ?? defaultExpenseAccount

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.purchaseInvoice.create({
        data: {
          id,
          companyId,
          supplierId,
          invoiceNumber: billNumber,
          reference: reference || null,
          issueDate: issue,
          dueDate: due,
          notes: description || notes || null,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paidAmount: 0,
          balanceDue: totals.totalAmount,
          status: status as any,
          lineItems: {
            create: lines.map((l: { description: string; quantity: number; unitPrice: number; taxRate: number; subtotal: number; taxAmount: number; lineTotal: number }) => ({
              id: crypto.randomUUID(),
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
              subtotal: l.subtotal,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
            })),
          },
        },
      })

      if (payableAccount && expenseAccount) {
        await postPurchaseInvoiceToGL(tx, {
          companyId,
          invoiceId: inv.id,
          invoiceNumber: billNumber,
          entryDate: issue.toISOString(),
          totalAmount: totals.totalAmount,
          payableAccountId: payableAccount.id,
          expenseAccountId: expenseAccount.id,
          userId: session.userId,
        })
      }

      await tx.supplier.update({ where: { id: supplierId }, data: { current_balance: { increment: totals.totalAmount } } })

      return inv
    })

    await logAudit({
      companyId: session.companyId,
      userId: session.userId,
      userName: session.name,
      action: 'CREATE',
      module: 'PurchaseInvoices',
      recordId: invoice.id,
      newValues: { billNumber, supplierId, totalAmount: totals.totalAmount },
    })

    // Recalculate supplier balance to ensure consistency
    await prisma.$transaction(async (tx) => {
      await recalculateSupplierOutstandingBalance(tx, supplierId, companyId)
    })

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        billNumber: invoice.invoiceNumber,
        reference: invoice.reference,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        balanceDue: Number(invoice.balanceDue),
        status: invoice.status,
        supplier: { id: supplier.id, name: supplier.company_name ?? '' },
      },
    }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}

