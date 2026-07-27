import { formatCurrency, formatDate } from './utils'
import { startBrandedDoc, finalizeBrandedDoc, drawTable, addSignatureBlock, addQrCode, addBarcode, type PdfCompany } from './pdf-engine'

// Programmatic client-side PDF generation, built on the shared engine in
// lib/pdf-engine.ts (real per-page pagination via drawTable, a rendered
// company logo, page numbers on every page, watermark, signature block).

export async function exportReportPdf(
  reportType: string,
  reportData: any,
  company: PdfCompany,
  options: { from?: string; to?: string; asAt?: string; generatedBy?: string } = {}
) {
  let dateRange = ''
  if (options.from && options.to) dateRange = `Period: ${formatDate(options.from)} to ${formatDate(options.to)}`
  else if (options.asAt) dateRange = `As at: ${formatDate(options.asAt)}`

  const title = reportType.replace(/-/g, ' ').toUpperCase()
  const ctx = await startBrandedDoc(company, title, dateRange)
  const { doc, margin, pageWidth } = ctx
  let lastY = 48

  if (reportType === 'income-statement') {
    const data = reportData
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text('REVENUE', margin, lastY)
    lastY += 3

    const revRows = (data.revenueRows || []).map((r: any) => [r.accountCode, r.name, formatCurrency(r.amount)])
    revRows.push(['', 'Total Revenue', formatCurrency(data.totalRevenue)])
    lastY = drawTable(ctx, { headers: ['Code', 'Account', 'Amount'], rows: revRows, colWidths: [30, 110, 40], aligns: ['left', 'left', 'right'], startY: lastY, pageTitle: title })
    lastY += 8

    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text('EXPENSES', margin, lastY)
    lastY += 3

    const expRows = (data.expenseRows || []).map((r: any) => [r.accountCode, r.name, formatCurrency(r.amount)])
    expRows.push(['', 'Total Expenses', formatCurrency(data.totalExpenses)])
    lastY = drawTable(ctx, { headers: ['Code', 'Account', 'Amount'], rows: expRows, colWidths: [30, 110, 40], aligns: ['left', 'left', 'right'], startY: lastY, pageTitle: title })
    lastY += 8

    doc.setFillColor(data.netProfit >= 0 ? 240 : 254, data.netProfit >= 0 ? 253 : 242, data.netProfit >= 0 ? 250 : 242)
    doc.rect(margin, lastY, pageWidth - margin * 2, 12, 'F')
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11)
    doc.setTextColor(data.netProfit >= 0 ? 21 : 185, data.netProfit >= 0 ? 128 : 28, data.netProfit >= 0 ? 61 : 28)
    doc.text(`Net ${data.netProfit >= 0 ? 'Profit' : 'Loss'}`, margin + 4, lastY + 8)
    doc.text(formatCurrency(Math.abs(data.netProfit)), pageWidth - margin - 4, lastY + 8, { align: 'right' })
  } else if (reportType === 'balance-sheet') {
    const data = reportData
    const categories = ['ASSET', 'LIABILITY', 'EQUITY'] as const
    const labels = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity' }

    categories.forEach((t) => {
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
      doc.text(labels[t].toUpperCase(), margin, lastY)
      lastY += 3

      const categoryRows = (data.rows || []).filter((r: any) => r.type === t).map((r: any) => [r.accountCode, r.name, formatCurrency(r.balance)])
      const total = (data.rows || []).filter((r: any) => r.type === t).reduce((sum: number, r: any) => sum + r.balance, 0)
      categoryRows.push(['', `Total ${labels[t]}`, formatCurrency(total)])

      lastY = drawTable(ctx, { headers: ['Code', 'Account', 'Balance'], rows: categoryRows, colWidths: [30, 110, 40], aligns: ['left', 'left', 'right'], startY: lastY, pageTitle: title })
      lastY += 8
    })

    doc.setFillColor(data.balanced ? 240 : 254, data.balanced ? 253 : 242, data.balanced ? 250 : 242)
    doc.rect(margin, lastY, pageWidth - margin * 2, 12, 'F')
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10)
    doc.setTextColor(data.balanced ? 21 : 185, data.balanced ? 128 : 28, data.balanced ? 61 : 28)
    doc.text('Balance Check: Assets = Liabilities + Equity', margin + 4, lastY + 8)
    doc.text(data.balanced ? '✓ Balanced' : '✗ Out of Balance', pageWidth - margin - 4, lastY + 8, { align: 'right' })
  } else if (reportType === 'trial-balance') {
    const data = reportData
    const rows = (data.rows || []).map((r: any) => [r.accountCode, r.name, (r.type || '').toLowerCase(), r.totalDebit > 0 ? formatCurrency(r.totalDebit) : '—', r.totalCredit > 0 ? formatCurrency(r.totalCredit) : '—'])
    rows.push(['', 'Totals', '', formatCurrency(data.grandDebit), formatCurrency(data.grandCredit)])
    lastY = drawTable(ctx, { headers: ['Code', 'Account', 'Type', 'Debit', 'Credit'], rows, colWidths: [25, 80, 25, 25, 25], aligns: ['left', 'left', 'left', 'right', 'right'], startY: lastY, pageTitle: title })
  } else if (reportType === 'aged-receivables' || reportType === 'aged-payables') {
    const data = reportData
    const isRec = reportType === 'aged-receivables'
    const nameField = isRec ? 'customer' : 'supplier'

    const rows = (data.rows || []).map((r: any) => [r[nameField], formatCurrency(r.current), formatCurrency(r.days1_30), formatCurrency(r.days31_60), formatCurrency(r.days61_90), formatCurrency(r.days90plus), formatCurrency(r.total)])
    rows.push(['Total', formatCurrency(data.totals.current), formatCurrency(data.totals.days1_30), formatCurrency(data.totals.days31_60), formatCurrency(data.totals.days61_90), formatCurrency(data.totals.days90plus), formatCurrency(data.totals.total)])

    lastY = drawTable(ctx, { headers: ['Name', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total'], rows, colWidths: [42, 23, 23, 23, 23, 23, 23], aligns: ['left', 'right', 'right', 'right', 'right', 'right', 'right'], startY: lastY, pageTitle: title })
  } else if (reportType === 'cash-flow') {
    const data = reportData
    const sections: { key: 'operating' | 'investing' | 'financing'; label: string }[] = [
      { key: 'operating', label: 'Cash Flow from Operating Activities' },
      { key: 'investing', label: 'Cash Flow from Investing Activities' },
      { key: 'financing', label: 'Cash Flow from Financing Activities' },
    ]
    sections.forEach(({ key, label }) => {
      const section = data[key]
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
      doc.text(label.toUpperCase(), margin, lastY)
      lastY += 3
      const rows = (section?.lines || []).map((r: any) => ['', r.label, formatCurrency(r.amount)])
      rows.push(['', `Net Cash from ${label.replace('Cash Flow from ', '')}`, formatCurrency(section?.total ?? 0)])
      lastY = drawTable(ctx, { headers: ['', 'Item', 'Amount'], rows, colWidths: [10, 130, 40], aligns: ['left', 'left', 'right'], startY: lastY, pageTitle: title })
      lastY += 8
    })
    doc.setFillColor(240, 253, 250)
    doc.rect(margin, lastY, pageWidth - margin * 2, 12, 'F')
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(21, 128, 61)
    doc.text('Net Change in Cash', margin + 4, lastY + 8)
    doc.text(formatCurrency(data.netChange ?? 0), pageWidth - margin - 4, lastY + 8, { align: 'right' })
  } else if (reportType === 'bank-reconciliation') {
    const data = reportData
    const rows = (data.rows || []).map((r: any) => [r.bankName, r.accountNumber, formatDate(r.reconcileDate), formatCurrency(r.statementBalance), formatCurrency(r.bookBalance), formatCurrency(r.difference), r.status])
    lastY = drawTable(ctx, { headers: ['Bank', 'Account', 'Date', 'Statement Bal.', 'Book Bal.', 'Difference', 'Status'], rows, colWidths: [35, 30, 25, 27, 27, 27, 20], aligns: ['left', 'left', 'left', 'right', 'right', 'right', 'left'], startY: lastY, pageTitle: title })
  } else if (reportType === 'general-ledger') {
    const data = reportData
    for (const account of (data.accounts || [])) {
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
      doc.text(`${account.accountCode ?? ''} — ${account.accountName ?? ''}`, margin, lastY)
      lastY += 3
      const rows = (account.lines || []).map((l: any) => [formatDate(l.date), l.reference ?? '', l.description ?? '', l.debit > 0 ? formatCurrency(l.debit) : '—', l.credit > 0 ? formatCurrency(l.credit) : '—', formatCurrency(l.runningBalance)])
      rows.push(['', '', 'Closing Balance', '', '', formatCurrency(account.closingBalance)])
      lastY = drawTable(ctx, { headers: ['Date', 'Ref', 'Description', 'Debit', 'Credit', 'Balance'], rows, colWidths: [22, 25, 63, 25, 25, 25], aligns: ['left', 'left', 'left', 'right', 'right', 'right'], startY: lastY, pageTitle: title })
      lastY += 8
    }
  } else if (reportType === 'audit-trail') {
    const data = reportData
    const rows = (data.rows || []).map((r: any) => [formatDate(r.createdAt), r.userName ?? '', r.module ?? '', r.action ?? '', r.recordId ?? ''])
    lastY = drawTable(ctx, { headers: ['Date', 'User', 'Module', 'Action', 'Record'], rows, colWidths: [30, 35, 30, 25, 55], aligns: ['left', 'left', 'left', 'left', 'left'], startY: lastY, pageTitle: title })
  } else if (reportType === 'statement-of-account') {
    const data = reportData
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text(data.partyName ?? '', margin, lastY)
    lastY += 6
    const rows = (data.lines || []).map((l: any) => [formatDate(l.date), l.type, l.reference ?? '', l.description ?? '', l.charge > 0 ? formatCurrency(l.charge) : '—', l.payment > 0 ? formatCurrency(l.payment) : '—', formatCurrency(l.runningBalance)])
    rows.unshift(['', '', '', 'Opening Balance', '', '', formatCurrency(data.openingBalance)])
    rows.push(['', '', '', 'Closing Balance', '', '', formatCurrency(data.closingBalance)])
    lastY = drawTable(ctx, { headers: ['Date', 'Type', 'Ref', 'Description', 'Charge', 'Payment', 'Balance'], rows, colWidths: [22, 20, 25, 48, 22, 22, 26], aligns: ['left', 'left', 'left', 'left', 'right', 'right', 'right'], startY: lastY, pageTitle: title })
  } else if (reportType === 'user-activity') {
    const data = reportData
    for (const user of (data.users || [])) {
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
      doc.text(`${user.userName} — ${user.totalActions} action(s), ${user.loginCount} login(s)`, margin, lastY)
      lastY += 3
      const rows = (user.byModule || []).map((m: any) => [m.module, String(m.count)])
      lastY = drawTable(ctx, { headers: ['Module', 'Actions'], rows, colWidths: [140, 40], aligns: ['left', 'right'], startY: lastY, pageTitle: title })
      lastY += 8
    }
  }

  finalizeBrandedDoc(ctx, company, { generatedBy: options.generatedBy })
  doc.save(`${reportType}-${options.to || options.asAt || 'report'}.pdf`)
}

export async function exportDocumentPdf(
  type: 'invoice' | 'quotation' | 'receipt' | 'payment' | 'voucher',
  docData: any,
  company: PdfCompany,
  options: { mode?: 'download' | 'preview' } = {}
) {
  const isVoucher = type === 'voucher'
  const title = isVoucher ? (docData.payment_type === 'Customer Receipt' ? 'CASH RECEIPT VOUCHER' : 'PAYMENT VOUCHER') : type.toUpperCase()
  const ctx = await startBrandedDoc(company, title)
  const { doc, margin, pageWidth, pageHeight, themeRgb } = ctx

  const number = docData.invoice_number || docData.quoteNumber || docData.payment_number || (docData.id ? String(docData.id).slice(0, 8) : 'Unreferenced')
  const date = docData.invoice_date || docData.issueDate || docData.payment_date || docData.receiptDate || ''
  const dueDate = docData.due_date || docData.validUntil || ''

  doc.setFillColor(248, 250, 252)
  doc.rect(pageWidth - margin - 50, 14, 50, 20, 'F')
  doc.setFont('Helvetica', 'bold'); doc.setFontSize(10)
  doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
  doc.text(number, pageWidth - margin - 46, 22)
  doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105)
  doc.text(`Date: ${date ? formatDate(date) : '—'}`, pageWidth - margin - 46, 28)

  let lastY = 50

  if (isVoucher) {
    const label = docData.payment_type === 'Customer Receipt' ? 'Received From' : 'Paid To'
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text(label.toUpperCase(), margin, lastY)
    lastY += 6
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(15, 23, 42)
    doc.text(docData.party_name || docData.customer_name || '—', margin, lastY)
    lastY += 10

    doc.setFillColor(240, 253, 250)
    doc.rect(margin, lastY, pageWidth - margin * 2, 16, 'F')
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.text('Amount:', margin + 4, lastY + 10)
    doc.setFontSize(13); doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
    doc.text(formatCurrency(Number(docData.amount ?? 0), docData.currency), pageWidth - margin - 4, lastY + 10, { align: 'right' })
    lastY += 24

    doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.text(`Method: ${docData.payment_method || docData.method || '—'}`, margin, lastY)
    lastY += 5
    doc.text(`Reference: ${docData.reference || docData.payment_number || '—'}`, margin, lastY)
    lastY += 5
    if (docData.description || docData.notes) {
      doc.text(`Description: ${docData.description || docData.notes}`, margin, lastY)
      lastY += 5
    }
    lastY += 10
  } else {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text('BILL TO', margin, lastY)
    if (type === 'invoice' || type === 'receipt') doc.text('DETAILS', pageWidth / 2 + 10, lastY)

    lastY += 5
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    const recipientName = docData.customer_name || docData.party_name || 'Customer'
    doc.text(recipientName, margin, lastY)
    if (docData.customer_id) doc.text(`ID: ${docData.customer_id}`, margin, lastY + 4)

    if (type === 'invoice' || type === 'receipt') {
      doc.text(`Ref: ${docData.reference || '—'}`, pageWidth / 2 + 10, lastY)
      doc.text(`Currency: ${docData.currency || 'USD'}`, pageWidth / 2 + 10, lastY + 4)
      if (dueDate) doc.text(`Due Date: ${formatDate(dueDate)}`, pageWidth / 2 + 10, lastY + 8)
    }
    lastY += 15

    const items = docData.lineItems || docData.quotationItems || []
    if (items.length > 0) {
      const rows = items.map((item: any, idx: number) => [
        String(idx + 1),
        item.description || '',
        String(item.quantity || 0),
        formatCurrency(item.unitPrice || item.unit_price || 0),
        formatCurrency(item.lineTotal || item.total || 0),
      ])
      lastY = drawTable(ctx, {
        headers: ['#', 'Item Description', 'Qty', 'Rate', 'Total'],
        rows,
        colWidths: [10, 100, 25, 30, 35],
        aligns: ['left', 'left', 'right', 'right', 'right'],
        startY: lastY,
        pageTitle: title,
      })
    }
    lastY += 5

    const summaryX = pageWidth - margin - 60
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    const subtotal = docData.subtotal || docData.total || 0
    const discount = docData.discount_amount || 0
    const tax = docData.tax_amount || docData.taxAmount || docData.tax || 0
    const total = docData.total_amount || docData.totalAmount || docData.total || 0

    doc.text('Subtotal:', summaryX, lastY)
    doc.text(formatCurrency(subtotal), pageWidth - margin, lastY, { align: 'right' })
    lastY += 5

    if (discount > 0) {
      doc.text('Discount:', summaryX, lastY)
      doc.text(formatCurrency(discount), pageWidth - margin, lastY, { align: 'right' })
      lastY += 5
    }
    if (tax > 0) {
      doc.text(`${company.taxName || 'VAT'}:`, summaryX, lastY)
      doc.text(formatCurrency(tax), pageWidth - margin, lastY, { align: 'right' })
      lastY += 5
    }

    doc.setFont('Helvetica', 'bold'); doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
    doc.text('Grand Total:', summaryX, lastY)
    doc.text(formatCurrency(total), pageWidth - margin, lastY, { align: 'right' })
    lastY += 7

    if (docData.amount_paid !== undefined) {
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(71, 85, 105)
      doc.text('Amount Paid:', summaryX, lastY)
      doc.text(formatCurrency(docData.amount_paid), pageWidth - margin, lastY, { align: 'right' })
      lastY += 5
      doc.setFont('Helvetica', 'bold')
      doc.text('Balance Due:', summaryX, lastY)
      doc.text(formatCurrency(docData.balance_due || 0), pageWidth - margin, lastY, { align: 'right' })
      lastY += 5
    }

    if (docData.notes) {
      doc.setFont('Helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(100, 116, 139)
      doc.text(`Notes: ${docData.notes}`, margin, lastY + 4)
      lastY += 8
    }
  }

  // Signature block + QR (voucher and non-line-item documents get one on the
  // main page; long invoices/quotations get it appended after their table).
  if (lastY < pageHeight - 60) {
    lastY = await addSignatureBlock(ctx, company, lastY + 6)
  }
  if (company.qrEnabled) {
    await addQrCode(ctx, `${type}:${number}`, pageWidth - margin - 24, lastY)
  }
  if (company.barcodeEnabled) {
    await addBarcode(ctx, `${type}:${number}`, margin, lastY, 40, 12)
  }

  if (company.bankName) {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
    doc.text(`Bank: ${company.bankName} | A/C: ${company.bankAccountNumber || ''} | Branch: ${company.bankBranch || ''}`, margin, Math.min(lastY, pageHeight - 16))
  }

  const status = docData.status
  finalizeBrandedDoc(ctx, company, { watermark: status && ['VOID', 'DRAFT', 'CANCELLED'].includes(String(status).toUpperCase()) ? String(status) : undefined })

  if (options.mode === 'preview') {
    window.open(doc.output('bloburl'), '_blank')
  } else {
    doc.save(`${type}-${number}.pdf`)
  }
}

export async function exportHrReportPdf(
  type: 'payslip' | 'inventory' | 'assets' | 'leave-approval' | 'overtime-approval' | 'expense-claim' | 'risk-assessment' | 'site-inspection',
  data: any,
  company: PdfCompany
) {
  const titles: Record<string, string> = {
    payslip: 'PAYSLIP',
    inventory: 'INVENTORY REPORT',
    assets: 'FIXED ASSETS REPORT',
    'leave-approval': 'LEAVE APPROVAL FORM',
    'overtime-approval': 'OVERTIME APPROVAL FORM',
    'expense-claim': 'EXPENSE CLAIM FORM',
    'risk-assessment': 'RISK ASSESSMENT REPORT',
    'site-inspection': 'SECURITY SITE INSPECTION REPORT',
  }
  const ctx = await startBrandedDoc(company, titles[type])
  const { doc, margin, pageWidth } = ctx
  let y = 48

  if (type === 'payslip') {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text(data.guard?.name || 'Employee', margin, y)
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    y += 5
    doc.text(`Employee #: ${data.guard?.employeeNumber || '—'}   Department: ${data.guard?.department || '—'}   Rank: ${data.guard?.rank || '—'}`, margin, y)
    y += 5
    if (data.payrollRun) {
      doc.text(`Pay Run: ${data.payrollRun.reference || '—'}   Period: ${formatDate(data.payrollRun.payPeriodStart)} – ${formatDate(data.payrollRun.payPeriodEnd)}`, margin, y)
      y += 5
    }
    doc.text(`Hours Worked: ${data.hoursWorked ?? 0}   Overtime Hours: ${data.overtimeHours ?? 0}   Status: ${data.status || '—'}`, margin, y)
    y += 8

    // Basic Salary/Overtime shown as their own rows ahead of configured items
    // so the printed table actually sums to the printed Gross Pay figure.
    const baseRows: (string | number)[][] = []
    if (data.basicSalary != null) baseRows.push(['Basic Salary', 'EARNING', formatCurrency(data.basicSalary)])
    if (data.overtimePay) baseRows.push(['Overtime Pay', 'EARNING', formatCurrency(data.overtimePay)])
    const lineRows = [...baseRows, ...(data.lines || []).map((l: any) => [l.name, l.type, formatCurrency(l.amount)])]
    y = drawTable(ctx, { headers: ['Item', 'Type', 'Amount'], rows: lineRows, colWidths: [90, 40, 46], aligns: ['left', 'left', 'right'], startY: y, pageTitle: titles.payslip })
    y += 8

    doc.setFillColor(240, 253, 250)
    doc.rect(margin, y, pageWidth - margin * 2, 24, 'F')
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.text('Gross Pay:', margin + 4, y + 7)
    doc.text(formatCurrency(data.grossPay), pageWidth - margin - 4, y + 7, { align: 'right' })
    doc.text('Total Deductions:', margin + 4, y + 13)
    doc.text(formatCurrency(data.totalDeductions), pageWidth - margin - 4, y + 13, { align: 'right' })
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(21, 128, 61)
    doc.text('Net Pay:', margin + 4, y + 20)
    doc.text(formatCurrency(data.netPay), pageWidth - margin - 4, y + 20, { align: 'right' })
    y += 32

    if (data.ytdGrossPay != null) {
      doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139)
      doc.text(`Year-to-Date Gross: ${formatCurrency(data.ytdGrossPay)}   Year-to-Date Net: ${formatCurrency(data.ytdNetPay ?? 0)}`, margin, y)
      y += 8
    }
    await addSignatureBlock(ctx, company, y)

    finalizeBrandedDoc(ctx, company, {})
    doc.save(`payslip-${data.guard?.employeeNumber || data.id}.pdf`)
    return
  }

  if (type === 'leave-approval') {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    const rows: [string, string][] = [
      ['Employee', data.guard?.name || '—'],
      ['Employee #', data.guard?.employeeNumber || '—'],
      ['Leave Type', data.leaveType || '—'],
      ['From', data.startDate ? formatDate(data.startDate) : '—'],
      ['To', data.endDate ? formatDate(data.endDate) : '—'],
      ['Days', String(data.days ?? '—')],
      ['Reason', data.reason || '—'],
      ['Status', data.status || '—'],
      ['Approved By', data.approvedByName || '—'],
    ]
    rows.forEach(([label, value]) => {
      doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105)
      doc.text(`${label}:`, margin, y)
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      doc.text(String(value), margin + 45, y)
      y += 7
    })
    y += 10
    await addSignatureBlock(ctx, company, y)
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`leave-approval-${data.guard?.employeeNumber || data.id}.pdf`)
    return
  }

  if (type === 'overtime-approval') {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    const rows: [string, string][] = [
      ['Employee', data.guard?.name || '—'],
      ['Date', data.date ? formatDate(data.date) : '—'],
      ['Hours Requested', String(data.hoursRequested ?? '—')],
      ['Reason', data.reason || '—'],
      ['Status', data.status || '—'],
      ['Approved By', data.approvedByName || '—'],
    ]
    rows.forEach(([label, value]) => {
      doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105)
      doc.text(`${label}:`, margin, y)
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      doc.text(String(value), margin + 45, y)
      y += 7
    })
    y += 10
    await addSignatureBlock(ctx, company, y)
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`overtime-approval-${data.id}.pdf`)
    return
  }

  if (type === 'expense-claim') {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    const rows: [string, string][] = [
      ['Claim #', data.claimNumber || '—'],
      ['Submitted By', data.submittedBy?.name || '—'],
      ['Category', data.category || '—'],
      ['Expense Date', data.expenseDate ? formatDate(data.expenseDate) : '—'],
      ['Amount', formatCurrency(Number(data.amount ?? 0), data.currency)],
      ['Description', data.description || '—'],
      ['Status', data.status || '—'],
    ]
    rows.forEach(([label, value]) => {
      doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105)
      doc.text(`${label}:`, margin, y)
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      doc.text(String(value), margin + 45, y)
      y += 7
    })
    y += 10
    await addSignatureBlock(ctx, company, y)
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`expense-claim-${data.claimNumber || data.id}.pdf`)
    return
  }

  if (type === 'risk-assessment') {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    const rows: [string, string][] = [
      ['Site', data.site?.name || '—'],
      ['Assessed By', data.assessedBy || '—'],
      ['Assessed At', data.assessedAt ? formatDate(data.assessedAt) : '—'],
      ['Category', data.category || '—'],
      ['Likelihood', data.likelihood || '—'],
      ['Impact', data.impact || '—'],
      ['Risk Rating', data.riskRating || '—'],
      ['Review Date', data.reviewDate ? formatDate(data.reviewDate) : '—'],
      ['Status', data.status || '—'],
    ]
    rows.forEach(([label, value]) => {
      doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105)
      doc.text(`${label}:`, margin, y)
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      doc.text(String(value), margin + 45, y)
      y += 7
    })
    y += 4
    doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105); doc.text('Findings:', margin, y); y += 6
    doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    y = doc.splitTextToSize(data.findings || '—', pageWidth - margin * 2).reduce((yy: number, line: string) => { doc.text(line, margin, yy); return yy + 5 }, y)
    y += 4
    doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105); doc.text('Mitigation Plan:', margin, y); y += 6
    doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    y = doc.splitTextToSize(data.mitigationPlan || '—', pageWidth - margin * 2).reduce((yy: number, line: string) => { doc.text(line, margin, yy); return yy + 5 }, y)
    y += 10
    await addSignatureBlock(ctx, company, y)
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`risk-assessment-${data.id}.pdf`)
    return
  }

  if (type === 'site-inspection') {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    const rows: [string, string][] = [
      ['Site', data.site?.name || '—'],
      ['Inspected By', data.inspectedBy || '—'],
      ['Inspected At', data.inspectedAt ? formatDate(data.inspectedAt) : '—'],
      ['Overall Rating', data.overallRating || '—'],
      ['Status', data.status || '—'],
    ]
    rows.forEach(([label, value]) => {
      doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105)
      doc.text(`${label}:`, margin, y)
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      doc.text(String(value), margin + 45, y)
      y += 7
    })
    y += 4
    const checklist: { item: string; pass: boolean; note?: string }[] = Array.isArray(data.checklist) ? data.checklist : JSON.parse(data.checklist || '[]')
    const checklistRows = checklist.map((c) => ['', c.item, c.pass ? 'Pass' : 'Fail', c.note || ''])
    y = drawTable(ctx, { headers: ['', 'Checklist Item', 'Result', 'Note'], rows: checklistRows, colWidths: [6, 60, 20, 84], aligns: ['left', 'left', 'left', 'left'], startY: y, pageTitle: titles[type] })
    y += 8
    doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105); doc.text('Findings:', margin, y); y += 6
    doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
    y = doc.splitTextToSize(data.findings || '—', pageWidth - margin * 2).reduce((yy: number, line: string) => { doc.text(line, margin, yy); return yy + 5 }, y)
    if (data.correctiveActions) {
      y += 4
      doc.setFont('Helvetica', 'bold'); doc.setTextColor(71, 85, 105); doc.text('Corrective Actions:', margin, y); y += 6
      doc.setFont('Helvetica', 'normal'); doc.setTextColor(15, 23, 42)
      y = doc.splitTextToSize(data.correctiveActions, pageWidth - margin * 2).reduce((yy: number, line: string) => { doc.text(line, margin, yy); return yy + 5 }, y)
    }
    y += 10
    await addSignatureBlock(ctx, company, y)
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`site-inspection-${data.id}.pdf`)
    return
  }

  if (type === 'inventory') {
    const rows = (data as any[]).map((i) => [i.name, i.category, `${i.quantityOnHand} ${i.unit}`, formatCurrency(i.unitCost), formatCurrency(i.totalValue), i.lowStock ? 'Low Stock' : 'OK'])
    const totalValue = (data as any[]).reduce((s, i) => s + Number(i.totalValue || 0), 0)
    rows.push(['', '', '', 'Total Value', formatCurrency(totalValue), ''])
    drawTable(ctx, { headers: ['Item', 'Category', 'Qty on Hand', 'Unit Cost', 'Total Value', 'Status'], rows, colWidths: [45, 35, 30, 30, 30, 22], aligns: ['left', 'left', 'left', 'right', 'right', 'left'], startY: y, pageTitle: titles.inventory })
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`inventory-report-${formatDate(new Date())}.pdf`)
    return
  }

  if (type === 'assets') {
    const rows = (data as any[]).map((a) => [a.name, a.category, formatDate(a.purchaseDate), formatCurrency(a.purchasePrice), formatCurrency(a.accumulatedDepreciation), formatCurrency(a.currentValue), a.status])
    const totals = (data as any[]).reduce((acc, a) => ({ price: acc.price + Number(a.purchasePrice || 0), dep: acc.dep + Number(a.accumulatedDepreciation || 0), value: acc.value + Number(a.currentValue || 0) }), { price: 0, dep: 0, value: 0 })
    rows.push(['', '', 'Totals', formatCurrency(totals.price), formatCurrency(totals.dep), formatCurrency(totals.value), ''])
    drawTable(ctx, { headers: ['Asset', 'Category', 'Purchase Date', 'Purchase Price', 'Accum. Dep.', 'Net Book Value', 'Status'], rows, colWidths: [40, 28, 26, 28, 26, 28, 16], aligns: ['left', 'left', 'left', 'right', 'right', 'right', 'left'], startY: y, pageTitle: titles.assets })
    finalizeBrandedDoc(ctx, company, {})
    doc.save(`fixed-assets-report-${formatDate(new Date())}.pdf`)
  }
}

// Executive / Management Summary Report -- KPI tiles + supporting tables, a
// different shape from the tabular financial statements above, so this is
// its own function rather than another exportReportPdf case (per the Phase 4
// investigation, autoTable-style row grids don't fit a KPI-tile layout).
export async function exportExecutiveReportPdf(data: any, company: PdfCompany) {
  const ctx = await startBrandedDoc(company, 'EXECUTIVE SUMMARY REPORT', `As at ${formatDate(new Date())}`)
  const { doc, margin, pageWidth } = ctx
  let y = 50

  const currency = data.reportingCurrency || 'USD'

  const tile = (label: string, value: string, x: number, tileY: number, w: number) => {
    doc.setDrawColor(226, 232, 240)
    doc.rect(x, tileY, w, 18)
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139)
    doc.text(label, x + 3, tileY + 6)
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42)
    doc.text(value, x + 3, tileY + 14)
  }

  const kpis: [string, string][] = [
    ['Total Revenue (FY)', formatCurrency(data.totalRevenue ?? 0, currency)],
    ['Outstanding Receivables', formatCurrency(data.outstandingReceivables ?? 0, currency)],
    ['Cash in Bank', formatCurrency(data.cashInBank ?? 0, currency)],
    ['Total Expenses (6mo)', formatCurrency(data.totalExpenses ?? 0, currency)],
    ['Working Capital', formatCurrency(data.ratios?.workingCapital ?? 0, currency)],
    ['Current Ratio', data.ratios?.currentRatio != null ? Number(data.ratios.currentRatio).toFixed(2) : 'N/A'],
    ['Active Guards', String(data.activeGuards ?? 0)],
    ['Active Sites', String(data.activeSites ?? 0)],
    ['Open Incidents', String(data.openIncidents ?? 0)],
    ['Critical Incidents', String(data.criticalIncidents ?? 0)],
    ['Guards on Duty Today', String(data.guardsOnDutyToday ?? 0)],
    ['Overdue Invoices', String(data.overdueInvoices ?? 0)],
  ]
  const tileW = (pageWidth - margin * 2 - 12) / 3
  kpis.forEach(([label, value], i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    tile(label, value, margin + col * (tileW + 6), y + row * 22, tileW)
  })
  y += Math.ceil(kpis.length / 3) * 22 + 8

  if (data.lastPayroll) {
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.text(`Last Payroll: ${formatCurrency(data.lastPayroll.totalNet, currency)} net (${formatDate(data.lastPayroll.periodStart)} – ${formatDate(data.lastPayroll.periodEnd)})`, margin, y)
    y += 8
  }

  if (data.topSites?.length) {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text('TOP SITES BY CONTRACT VALUE', margin, y)
    y += 3
    const rows = data.topSites.map((s: any) => [s.name, String(s.guards), formatCurrency(s.revenue, currency), s.status])
    y = drawTable(ctx, { headers: ['Site', 'Guards', 'Monthly Value', 'Status'], rows, colWidths: [80, 25, 40, 30], aligns: ['left', 'right', 'right', 'left'], startY: y, pageTitle: 'EXECUTIVE SUMMARY REPORT' })
    y += 8
  }

  if (data.incidentsBySeverity?.length) {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text('INCIDENTS BY SEVERITY (THIS MONTH)', margin, y)
    y += 3
    const rows = data.incidentsBySeverity.map((s: any) => [s.severity, String(s.count)])
    y = drawTable(ctx, { headers: ['Severity', 'Count'], rows, colWidths: [100, 75], aligns: ['left', 'right'], startY: y, pageTitle: 'EXECUTIVE SUMMARY REPORT' })
    y += 8
  }

  if (data.recentActivity?.length) {
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
    doc.text('RECENT ACTIVITY', margin, y)
    y += 3
    const rows = data.recentActivity.slice(0, 10).map((a: any) => [formatDate(a.createdAt), a.userName ?? '', a.module ?? '', a.action ?? ''])
    drawTable(ctx, { headers: ['Date', 'User', 'Module', 'Action'], rows, colWidths: [35, 50, 45, 45], aligns: ['left', 'left', 'left', 'left'], startY: y, pageTitle: 'EXECUTIVE SUMMARY REPORT' })
  }

  finalizeBrandedDoc(ctx, company, {})
  doc.save(`executive-summary-${formatDate(new Date())}.pdf`)
}
