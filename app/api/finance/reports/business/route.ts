import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const NORMAL_DEBIT = ['ASSET', 'EXPENSE']
function computeBalance(type: string, debit: number, credit: number) {
  return NORMAL_DEBIT.includes(type) ? debit - credit : credit - debit
}

type Row = { label: string; amount: number; bold?: boolean }
type Section = { heading: string; rows: Row[] }

async function getSession(req: NextRequest) {
  const s = await getIronSession<SessionData>(req, NextResponse.next(), sessionOptions)
  return s.isLoggedIn ? s : null
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (!startDate || !endDate) return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })

  const generatedAt = new Date().toISOString()

  if (type === 'INCOME_STATEMENT') {
    const postedEntries = await prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', entry_date: { gte: startDate, lte: endDate } },
      select: { id: true },
    })
    const entryIds = postedEntries.map((e) => e.id)

    const [revAccts, expAccts] = await Promise.all([
      prisma.chartOfAccount.findMany({ where: { account_type: 'REVENUE', companyId }, select: { id: true, account_name: true } }),
      prisma.chartOfAccount.findMany({ where: { account_type: 'EXPENSE', companyId }, select: { id: true, account_name: true } }),
    ])
    const [revLines, expLines] = await Promise.all([
      prisma.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: revAccts.map((a) => a.id) }, journalEntryId: { in: entryIds } }, _sum: { debit: true, credit: true } }),
      prisma.journalLine.groupBy({ by: ['accountId'], where: { accountId: { in: expAccts.map((a) => a.id) }, journalEntryId: { in: entryIds } }, _sum: { debit: true, credit: true } }),
    ])
    const revMap = Object.fromEntries(revLines.map((l) => [l.accountId, l._sum]))
    const expMap = Object.fromEntries(expLines.map((l) => [l.accountId, l._sum]))

    const revenueRows: Row[] = revAccts.map((a) => ({ label: a.account_name ?? a.id, amount: Number(revMap[a.id]?.credit ?? 0) - Number(revMap[a.id]?.debit ?? 0) }))
    const expenseRows: Row[] = expAccts.map((a) => ({ label: a.account_name ?? a.id, amount: Number(expMap[a.id]?.debit ?? 0) - Number(expMap[a.id]?.credit ?? 0) }))
    const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0)
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0)

    const sections: Section[] = [
      { heading: 'Revenue', rows: [...revenueRows, { label: 'Total Revenue', amount: totalRevenue, bold: true }] },
      { heading: 'Expenses', rows: [...expenseRows, { label: 'Total Expenses', amount: totalExpenses, bold: true }] },
      { heading: 'Summary', rows: [{ label: 'Net Profit', amount: totalRevenue - totalExpenses, bold: true }] },
    ]
    return NextResponse.json({ title: 'Income Statement', generatedAt, sections })
  }

  if (type === 'BALANCE_SHEET') {
    const accounts = await prisma.chartOfAccount.findMany({
      where: { account_type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, companyId },
      select: { id: true, account_name: true, account_type: true },
      orderBy: { account_code: 'asc' },
    })
    const postedEntries = await prisma.journalEntry.findMany({ where: { companyId, status: 'POSTED', entry_date: { lte: endDate } }, select: { id: true } })
    const lineAggs = await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map((a) => a.id) }, journalEntryId: { in: postedEntries.map((e) => e.id) } },
      _sum: { debit: true, credit: true },
    })
    const lineMap = Object.fromEntries(lineAggs.map((l) => [l.accountId, l._sum]))
    const rows = accounts.map((a) => ({ label: a.account_name ?? a.id, type: a.account_type ?? 'ASSET', amount: computeBalance(a.account_type ?? 'ASSET', Number(lineMap[a.id]?.debit ?? 0), Number(lineMap[a.id]?.credit ?? 0)) }))

    const assetRows = rows.filter((r) => r.type === 'ASSET')
    const liabilityRows = rows.filter((r) => r.type === 'LIABILITY')
    const equityRows = rows.filter((r) => r.type === 'EQUITY')
    const totalAssets = assetRows.reduce((s, r) => s + r.amount, 0)
    const totalLiabilities = liabilityRows.reduce((s, r) => s + r.amount, 0)
    const totalEquity = equityRows.reduce((s, r) => s + r.amount, 0)

    const sections: Section[] = [
      { heading: 'Assets', rows: [...assetRows, { label: 'Total Assets', amount: totalAssets, bold: true }] },
      { heading: 'Liabilities', rows: [...liabilityRows, { label: 'Total Liabilities', amount: totalLiabilities, bold: true }] },
      { heading: 'Equity', rows: [...equityRows, { label: 'Total Equity', amount: totalEquity, bold: true }] },
      { heading: 'Summary', rows: [{ label: 'Liabilities + Equity', amount: totalLiabilities + totalEquity, bold: true }] },
    ]
    return NextResponse.json({ title: 'Balance Sheet', generatedAt, sections })
  }

  if (type === 'CASHFLOW') {
    // Customer Receipts live in `payments` (payment_type = 'Customer Receipt'),
    // not the separate/unused `Receipt` model.
    const [receipts, payments] = await Promise.all([
      prisma.payment.findMany({ where: { companyId, payment_type: 'Customer Receipt', payment_date: { gte: startDate, lte: endDate } }, select: { amount: true } }),
      prisma.payment.findMany({ where: { companyId, payment_type: { not: 'Customer Receipt' }, payment_date: { gte: startDate, lte: endDate } }, select: { amount: true } }),
    ])
    const totalInflows = receipts.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    const totalOutflows = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)

    const sections: Section[] = [
      { heading: 'Cash Inflows', rows: [{ label: 'Customer Receipts', amount: totalInflows, bold: true }] },
      { heading: 'Cash Outflows', rows: [{ label: 'Payments Made', amount: totalOutflows, bold: true }] },
      { heading: 'Summary', rows: [{ label: 'Net Cash Flow', amount: totalInflows - totalOutflows, bold: true }] },
    ]
    return NextResponse.json({ title: 'Cash Flow Statement', generatedAt, sections })
  }

  if (type === 'TAX_SUMMARY') {
    const [salesAgg, purchaseAgg] = await Promise.all([
      prisma.salesInvoice.aggregate({ where: { companyId, status: { not: 'VOID' }, invoice_date: { gte: startDate, lte: endDate } }, _sum: { tax_amount: true } }),
      prisma.purchaseInvoice.aggregate({ where: { companyId, status: { not: 'VOID' }, issueDate: { gte: new Date(startDate), lte: new Date(endDate) } }, _sum: { taxAmount: true } }),
    ])
    const outputTax = Number(salesAgg._sum.tax_amount ?? 0)
    const inputTax = Number(purchaseAgg._sum.taxAmount ?? 0)

    const sections: Section[] = [
      { heading: 'Output Tax (Sales)', rows: [{ label: 'VAT Collected', amount: outputTax, bold: true }] },
      { heading: 'Input Tax (Purchases)', rows: [{ label: 'VAT Paid', amount: inputTax, bold: true }] },
      { heading: 'Summary', rows: [{ label: 'Net VAT Liability', amount: outputTax - inputTax, bold: true }] },
    ]
    return NextResponse.json({ title: 'Tax Summary', generatedAt, sections })
  }

  if (type === 'AGED_RECEIVABLES' || type === 'AGED_PAYABLES') {
    if (type === 'AGED_RECEIVABLES') {
      const customers = await prisma.customer.findMany({ where: { companyId } })
      const invoices = await prisma.salesInvoice.findMany({ where: { companyId, status: { notIn: ['VOID', 'PAID'] } }, select: { customer_id: true, due_date: true, balance_due: true } })
      const byCustomer = new Map<string, typeof invoices>()
      for (const inv of invoices) {
        const cid = inv.customer_id ?? ''
        if (!byCustomer.has(cid)) byCustomer.set(cid, [])
        byCustomer.get(cid)!.push(inv)
      }
      const rows: Row[] = customers
        .filter((c) => (byCustomer.get(c.id)?.length ?? 0) > 0)
        .map((c) => ({ label: c.company_name ?? c.id, amount: (byCustomer.get(c.id) ?? []).reduce((s, i) => s + Number(i.balance_due ?? 0), 0) }))
      const total = rows.reduce((s, r) => s + r.amount, 0)
      const sections: Section[] = [{ heading: 'Outstanding by Customer', rows: [...rows, { label: 'Total Outstanding', amount: total, bold: true }] }]
      return NextResponse.json({ title: 'Aged Receivables', generatedAt, sections })
    } else {
      const suppliers = await prisma.supplier.findMany({ where: { companyId } })
      const bills = await prisma.purchaseInvoice.findMany({ where: { companyId, status: { notIn: ['VOID', 'PAID'] }, balanceDue: { gt: 0 } }, select: { supplierId: true, balanceDue: true } })
      const bySupplier = new Map<string, typeof bills>()
      for (const b of bills) {
        if (!bySupplier.has(b.supplierId)) bySupplier.set(b.supplierId, [])
        bySupplier.get(b.supplierId)!.push(b)
      }
      const rows: Row[] = suppliers
        .filter((s) => (bySupplier.get(s.id)?.length ?? 0) > 0)
        .map((s) => ({ label: s.company_name ?? s.id, amount: (bySupplier.get(s.id) ?? []).reduce((sum, b) => sum + Number(b.balanceDue), 0) }))
      const total = rows.reduce((s, r) => s + r.amount, 0)
      const sections: Section[] = [{ heading: 'Outstanding by Supplier', rows: [...rows, { label: 'Total Outstanding', amount: total, bold: true }] }]
      return NextResponse.json({ title: 'Aged Payables', generatedAt, sections })
    }
  }

  return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
}
