import { formatCurrency, formatDate } from './utils'

// Programmatic client-side jsPDF drawing utility
// Designed for generating complete financial statements and document PDFs.

export async function exportReportPdf(
  reportType: string,
  reportData: any,
  company: any,
  options: { from?: string; to?: string; asAt?: string } = {}
) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  const primaryColor = company?.primaryColor || '#0b5fff'
  const companyName = company?.name || 'Ravenshield Security'
  const address = company?.address || ''
  const phone = company?.phone || ''
  const email = company?.email || ''
  
  // Set theme color conversion (hex to RGB)
  const hexToRgb = (hex: string) => {
    const cleanHex = hex.replace('#', '')
    const num = parseInt(cleanHex, 16)
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    }
  }
  const themeRgb = hexToRgb(primaryColor)

  let pageNumber = 1
  const docWidth = doc.internal.pageSize.width
  const docHeight = doc.internal.pageSize.height
  const margin = 14

  // Draw Header helper
  const drawHeader = (title: string) => {
    doc.setFillColor(themeRgb.r, themeRgb.g, themeRgb.b)
    doc.rect(0, 0, docWidth, 8, 'F')
    
    doc.setTextColor(30, 41, 59)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(companyName, margin, 20)
    
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(`${address} | ${phone} | ${email}`, margin, 25)
    
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
    doc.text(title, margin, 34)

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    
    let dateRange = ''
    if (options.from && options.to) {
      dateRange = `Period: ${formatDate(options.from)} to ${formatDate(options.to)}`
    } else if (options.asAt) {
      dateRange = `As at: ${formatDate(options.asAt)}`
    }
    doc.text(dateRange, margin, 39)
    
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, 43, docWidth - margin, 43)
  }

  // Draw Footer helper
  const drawFooter = () => {
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`Page ${pageNumber}`, docWidth - margin - 10, docHeight - 10)
    doc.text(`Generated on ${formatDate(new Date())} | Ravenshield Security ERP`, margin, docHeight - 10)
  }

  // Table drawing function
  const drawTable = (
    headers: string[],
    rows: any[][],
    colWidths: number[],
    aligns: ('left' | 'right')[],
    startY: number
  ) => {
    let currentY = startY

    // Draw header background
    doc.setFillColor(248, 250, 252)
    doc.rect(margin, currentY, docWidth - margin * 2, 8, 'F')
    
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)

    let currentX = margin
    headers.forEach((h, idx) => {
      const w = colWidths[idx]
      const align = aligns[idx]
      if (align === 'right') {
        doc.text(h, currentX + w, currentY + 6, { align: 'right' })
      } else {
        doc.text(h, currentX + 2, currentY + 6)
      }
      currentX += w
    })

    doc.setDrawColor(226, 232, 240)
    doc.line(margin, currentY + 8, docWidth - margin, currentY + 8)
    currentY += 8

    // Draw rows
    rows.forEach((row, rowIdx) => {
      // Check page break
      if (currentY + 10 > docHeight - 20) {
        drawFooter()
        doc.addPage()
        pageNumber++
        drawHeader(reportType.replace('-', ' ').toUpperCase())
        currentY = 48
        
        // Re-draw headers on new page
        doc.setFillColor(248, 250, 252)
        doc.rect(margin, currentY, docWidth - margin * 2, 8, 'F')
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(71, 85, 105)
        let headerX = margin
        headers.forEach((h, idx) => {
          const w = colWidths[idx]
          const align = aligns[idx]
          if (align === 'right') {
            doc.text(h, headerX + w, currentY + 6, { align: 'right' })
          } else {
            doc.text(h, headerX + 2, currentY + 6)
          }
          headerX += w
        })
        doc.line(margin, currentY + 8, docWidth - margin, currentY + 8)
        currentY += 8
      }

      // Check if row is a total/summary row (usually contains 'Total' or 'Summary')
      const isTotal = row.some(cell => typeof cell === 'string' && (cell.startsWith('Total') || cell.includes('Net Profit') || cell.includes('Net Loss') || cell === 'Totals'))
      
      if (isTotal) {
        doc.setFont('Helvetica', 'bold')
        doc.setFillColor(248, 250, 252)
        doc.rect(margin, currentY, docWidth - margin * 2, 8, 'F')
      } else {
        doc.setFont('Helvetica', 'normal')
      }
      doc.setFontSize(9)
      doc.setTextColor(15, 23, 42)

      let rowX = margin
      row.forEach((cell, idx) => {
        const w = colWidths[idx]
        const align = aligns[idx]
        const text = String(cell ?? '')
        if (align === 'right') {
          doc.text(text, rowX + w, currentY + 6, { align: 'right' })
        } else {
          doc.text(text, rowX + 2, currentY + 6)
        }
        rowX += w
      })

      doc.line(margin, currentY + 8, docWidth - margin, currentY + 8)
      currentY += 8
    })

    return currentY
  }

  // Generate Report based on Type
  const title = reportType.replace('-', ' ').toUpperCase()
  drawHeader(title)

  let lastY = 48

  if (reportType === 'income-statement') {
    const data = reportData
    // Revenue
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    doc.text('REVENUE', margin, lastY)
    lastY += 3

    const revRows = (data.revenueRows || []).map((r: any) => [
      r.accountCode,
      r.name,
      formatCurrency(r.amount)
    ])
    revRows.push(['', 'Total Revenue', formatCurrency(data.totalRevenue)])

    lastY = drawTable(
      ['Code', 'Account', 'Amount'],
      revRows,
      [30, 110, 40],
      ['left', 'left', 'right'],
      lastY
    )

    lastY += 8

    // Expenses
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    doc.text('EXPENSES', margin, lastY)
    lastY += 3

    const expRows = (data.expenseRows || []).map((r: any) => [
      r.accountCode,
      r.name,
      formatCurrency(r.amount)
    ])
    expRows.push(['', 'Total Expenses', formatCurrency(data.totalExpenses)])

    lastY = drawTable(
      ['Code', 'Account', 'Amount'],
      expRows,
      [30, 110, 40],
      ['left', 'left', 'right'],
      lastY
    )

    lastY += 8

    // Summary Box
    doc.setFillColor(data.netProfit >= 0 ? 240 : 254, data.netProfit >= 0 ? 253 : 242, data.netProfit >= 0 ? 250 : 242)
    doc.rect(margin, lastY, docWidth - margin * 2, 12, 'F')
    
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(data.netProfit >= 0 ? 21 : 185, data.netProfit >= 0 ? 128 : 28, data.netProfit >= 0 ? 61 : 28)
    doc.text(`Net ${data.netProfit >= 0 ? 'Profit' : 'Loss'}`, margin + 4, lastY + 8)
    doc.text(formatCurrency(Math.abs(data.netProfit)), docWidth - margin - 4, lastY + 8, { align: 'right' })

  } else if (reportType === 'balance-sheet') {
    const data = reportData
    const categories = ['ASSET', 'LIABILITY', 'EQUITY'] as const
    const labels = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity' }

    categories.forEach((t) => {
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(30, 41, 59)
      doc.text(labels[t].toUpperCase(), margin, lastY)
      lastY += 3

      const categoryRows = (data.rows || [])
        .filter((r: any) => r.type === t)
        .map((r: any) => [
          r.accountCode,
          r.name,
          formatCurrency(r.balance)
        ])
      
      const total = (data.rows || [])
        .filter((r: any) => r.type === t)
        .reduce((sum: number, r: any) => sum + r.balance, 0)

      categoryRows.push(['', `Total ${labels[t]}`, formatCurrency(total)])

      lastY = drawTable(
        ['Code', 'Account', 'Balance'],
        categoryRows,
        [30, 110, 40],
        ['left', 'left', 'right'],
        lastY
      )

      lastY += 8
    })

    // Check Balance
    doc.setFillColor(data.balanced ? 240 : 254, data.balanced ? 253 : 242, data.balanced ? 250 : 242)
    doc.rect(margin, lastY, docWidth - margin * 2, 12, 'F')
    
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(data.balanced ? 21 : 185, data.balanced ? 128 : 28, data.balanced ? 61 : 28)
    doc.text('Balance Check: Assets = Liabilities + Equity', margin + 4, lastY + 8)
    doc.text(data.balanced ? '✓ Balanced' : '✗ Out of Balance', docWidth - margin - 4, lastY + 8, { align: 'right' })

  } else if (reportType === 'trial-balance') {
    const data = reportData
    const rows = (data.rows || []).map((r: any) => [
      r.accountCode,
      r.name,
      r.type.toLowerCase(),
      r.totalDebit > 0 ? formatCurrency(r.totalDebit) : '—',
      r.totalCredit > 0 ? formatCurrency(r.totalCredit) : '—'
    ])
    rows.push(['', 'Totals', '', formatCurrency(data.grandDebit), formatCurrency(data.grandCredit)])

    lastY = drawTable(
      ['Code', 'Account', 'Type', 'Debit', 'Credit'],
      rows,
      [25, 80, 25, 25, 25],
      ['left', 'left', 'left', 'right', 'right'],
      lastY
    )

  } else if (reportType === 'aged-receivables' || reportType === 'aged-payables') {
    const data = reportData
    const isRec = reportType === 'aged-receivables'
    const nameField = isRec ? 'customer' : 'supplier'

    const rows = (data.rows || []).map((r: any) => [
      r[nameField],
      formatCurrency(r.current),
      formatCurrency(r.days1_30),
      formatCurrency(r.days31_60),
      formatCurrency(r.days61_90),
      formatCurrency(r.days90plus),
      formatCurrency(r.total)
    ])

    rows.push([
      'Total',
      formatCurrency(data.totals.current),
      formatCurrency(data.totals.days1_30),
      formatCurrency(data.totals.days31_60),
      formatCurrency(data.totals.days61_90),
      formatCurrency(data.totals.days90plus),
      formatCurrency(data.totals.total)
    ])

    lastY = drawTable(
      ['Name', 'Current', '1–30 Days', '31–60 Days', '61–90 Days', '90+ Days', 'Total'],
      rows,
      [42, 23, 23, 23, 23, 23, 23],
      ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
      lastY
    )
  }

  drawFooter()
  doc.save(`${reportType}-${options.to || options.asAt || 'report'}.pdf`)
}

export async function exportDocumentPdf(
  type: 'invoice' | 'quotation' | 'receipt' | 'payment',
  docData: any,
  company: any
) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  const primaryColor = company?.primaryColor || '#0b5fff'
  const companyName = company?.name || 'Ravenshield Security'
  const address = company?.address || ''
  const phone = company?.phone || ''
  const email = company?.email || ''
  const taxName = company?.taxName || 'VAT'

  const hexToRgb = (hex: string) => {
    const cleanHex = hex.replace('#', '')
    const num = parseInt(cleanHex, 16)
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
  }
  const themeRgb = hexToRgb(primaryColor)

  const docWidth = doc.internal.pageSize.width
  const docHeight = doc.internal.pageSize.height
  const margin = 14

  // Top header bar
  doc.setFillColor(themeRgb.r, themeRgb.g, themeRgb.b)
  doc.rect(0, 0, docWidth, 8, 'F')

  // Company details (Left)
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(30, 41, 59)
  doc.text(companyName, margin, 20)
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text(address, margin, 25)
  doc.text(`Phone: ${phone} | Email: ${email}`, margin, 29)

  // Document meta (Right)
  const title = type.toUpperCase()
  const number = docData.invoice_number || docData.quoteNumber || docData.payment_number || (docData.id ? String(docData.id).slice(0, 8) : 'Unreferenced')
  const date = docData.invoice_date || docData.issueDate || docData.payment_date || docData.receiptDate || ''
  const dueDate = docData.due_date || docData.validUntil || ''

  doc.setFillColor(248, 250, 252)
  doc.rect(docWidth - margin - 50, 14, 50, 20, 'F')
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
  doc.text(title, docWidth - margin - 46, 20)
  doc.setFontSize(10)
  doc.setTextColor(71, 85, 105)
  doc.text(number, docWidth - margin - 46, 25)
  doc.setFontSize(8)
  doc.text(`Date: ${date ? formatDate(date) : '—'}`, docWidth - margin - 46, 30)

  doc.setDrawColor(226, 232, 240)
  doc.line(margin, 38, docWidth - margin, 38)

  let lastY = 46

  // Bill To / Details grid
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  doc.text('BILL TO', margin, lastY)
  
  if (type === 'invoice' || type === 'receipt') {
    doc.text('DETAILS', docWidth / 2 + 10, lastY)
  }

  lastY += 5
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  
  const recipientName = docData.customer_name || docData.party_name || 'Customer'
  doc.text(recipientName, margin, lastY)
  if (docData.customer_id) {
    doc.text(`ID: ${docData.customer_id}`, margin, lastY + 4)
  }

  if (type === 'invoice' || type === 'receipt') {
    doc.text(`Ref: ${docData.reference || '—'}`, docWidth / 2 + 10, lastY)
    doc.text(`Currency: ${docData.currency || 'USD'}`, docWidth / 2 + 10, lastY + 4)
    if (dueDate) {
      doc.text(`Due Date: ${formatDate(dueDate)}`, docWidth / 2 + 10, lastY + 8)
    }
  }

  lastY += 15

  // Render Table / Items
  const items = docData.lineItems || docData.quotationItems || []
  if (items.length > 0) {
    doc.setFillColor(248, 250, 252)
    doc.rect(margin, lastY, docWidth - margin * 2, 7, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text('#', margin + 2, lastY + 5)
    doc.text('Item Description', margin + 10, lastY + 5)
    doc.text('Qty', margin + 110, lastY + 5, { align: 'right' })
    doc.text('Rate', margin + 135, lastY + 5, { align: 'right' })
    doc.text('Total', margin + 175, lastY + 5, { align: 'right' })

    doc.line(margin, lastY + 7, docWidth - margin, lastY + 7)
    lastY += 7

    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(15, 23, 42)

    items.forEach((item: any, idx: number) => {
      const desc = item.description || ''
      const qty = item.quantity || 0
      const price = item.unitPrice || item.unit_price || 0
      const total = item.lineTotal || item.total || 0

      doc.text(String(idx + 1), margin + 2, lastY + 5)
      doc.text(desc, margin + 10, lastY + 5)
      doc.text(String(qty), margin + 110, lastY + 5, { align: 'right' })
      doc.text(formatCurrency(price), margin + 135, lastY + 5, { align: 'right' })
      doc.text(formatCurrency(total), margin + 175, lastY + 5, { align: 'right' })

      doc.line(margin, lastY + 7, docWidth - margin, lastY + 7)
      lastY += 7
    })
  }

  lastY += 5

  // Summary (Bottom Right)
  const summaryX = docWidth - margin - 60
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)

  const subtotal = docData.subtotal || docData.total || 0
  const discount = docData.discount_amount || 0
  const tax = docData.tax_amount || docData.taxAmount || docData.tax || 0
  const total = docData.total_amount || docData.totalAmount || docData.total || 0

  doc.text('Subtotal:', summaryX, lastY)
  doc.text(formatCurrency(subtotal), docWidth - margin, lastY, { align: 'right' })
  lastY += 5

  if (discount > 0) {
    doc.text('Discount:', summaryX, lastY)
    doc.text(formatCurrency(discount), docWidth - margin, lastY, { align: 'right' })
    lastY += 5
  }

  if (tax > 0) {
    doc.text(`${taxName}:`, summaryX, lastY)
    doc.text(formatCurrency(tax), docWidth - margin, lastY, { align: 'right' })
    lastY += 5
  }

  doc.setFont('Helvetica', 'bold')
  doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
  doc.text('Grand Total:', summaryX, lastY)
  doc.text(formatCurrency(total), docWidth - margin, lastY, { align: 'right' })
  lastY += 7

  if (docData.amount_paid !== undefined) {
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text('Amount Paid:', summaryX, lastY)
    doc.text(formatCurrency(docData.amount_paid), docWidth - margin, lastY, { align: 'right' })
    lastY += 5

    doc.setFont('Helvetica', 'bold')
    doc.text('Balance Due:', summaryX, lastY)
    doc.text(formatCurrency(docData.balance_due || 0), docWidth - margin, lastY, { align: 'right' })
  }

  // Notes
  if (docData.notes) {
    doc.setFont('Helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(`Notes: ${docData.notes}`, margin, lastY + 4)
    lastY += 8
  }

  // Footer / Bank details
  lastY = Math.max(lastY, docHeight - 30)
  doc.setDrawColor(226, 232, 240)
  doc.line(margin, lastY, docWidth - margin, lastY)

  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(company.footerMessage || '', margin, lastY + 5)
  if (company.bankName) {
    doc.text(`Bank: ${company.bankName} | A/C: ${company.bankAccountNumber || ''} | Branch: ${company.bankBranch || ''}`, margin, lastY + 9)
  }

  doc.save(`${type}-${number}.pdf`)
}

export async function exportHrReportPdf(
  type: 'payslip' | 'inventory' | 'assets',
  data: any,
  company: any
) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  const primaryColor = company?.primaryColor || '#0b5fff'
  const companyName = company?.name || 'Ravenshield Security'
  const hexToRgb = (hex: string) => {
    const cleanHex = hex.replace('#', '')
    const num = parseInt(cleanHex, 16)
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
  }
  const themeRgb = hexToRgb(primaryColor)
  const docWidth = doc.internal.pageSize.width
  const docHeight = doc.internal.pageSize.height
  const margin = 14

  const drawHeader = (title: string) => {
    doc.setFillColor(themeRgb.r, themeRgb.g, themeRgb.b)
    doc.rect(0, 0, docWidth, 8, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(30, 41, 59)
    doc.text(companyName, margin, 20)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(themeRgb.r, themeRgb.g, themeRgb.b)
    doc.text(title, margin, 30)
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, 35, docWidth - margin, 35)
  }

  // Simple paginated table: widths sum should be <= (docWidth - margin*2)
  const drawTable = (headers: string[], rows: string[][], widths: number[], aligns: ('left' | 'right')[], startY: number, title: string) => {
    let y = startY
    const rowHeight = 7

    const drawTableHeader = () => {
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, y, docWidth - margin * 2, rowHeight, 'F')
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(71, 85, 105)
      let x = margin
      headers.forEach((h, i) => {
        doc.text(h, aligns[i] === 'right' ? x + widths[i] - 2 : x + 2, y + 5, { align: aligns[i] === 'right' ? 'right' : 'left' })
        x += widths[i]
      })
      y += rowHeight
    }

    drawTableHeader()
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(15, 23, 42)

    rows.forEach((row) => {
      if (y + rowHeight > docHeight - 20) {
        doc.addPage()
        y = 20
        drawHeader(title)
        y = 42
        drawTableHeader()
        doc.setFont('Helvetica', 'normal')
        doc.setTextColor(15, 23, 42)
      }
      let x = margin
      row.forEach((cell, i) => {
        doc.text(cell, aligns[i] === 'right' ? x + widths[i] - 2 : x + 2, y + 5, { align: aligns[i] === 'right' ? 'right' : 'left' })
        x += widths[i]
      })
      doc.line(margin, y + rowHeight, docWidth - margin, y + rowHeight)
      y += rowHeight
    })

    return y
  }

  if (type === 'payslip') {
    drawHeader('PAYSLIP')
    let y = 46

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 41, 59)
    doc.text(data.guard?.name || 'Employee', margin, y)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    y += 5
    doc.text(`Employee #: ${data.guard?.employeeNumber || '—'}   Department: ${data.guard?.department || '—'}   Rank: ${data.guard?.rank || '—'}`, margin, y)
    y += 5
    if (data.payrollRun) {
      doc.text(`Pay Run: ${data.payrollRun.reference || '—'}   Period: ${formatDate(data.payrollRun.payPeriodStart)} – ${formatDate(data.payrollRun.payPeriodEnd)}`, margin, y)
      y += 5
    }
    doc.text(`Hours Worked: ${data.hoursWorked ?? 0}   Overtime Hours: ${data.overtimeHours ?? 0}   Status: ${data.status || '—'}`, margin, y)
    y += 8

    const lineRows = (data.lines || []).map((l: any) => [l.name, l.type, formatCurrency(l.amount)])
    y = drawTable(['Item', 'Type', 'Amount'], lineRows, [90, 40, 46], ['left', 'left', 'right'], y, 'PAYSLIP')
    y += 8

    doc.setFillColor(240, 253, 250)
    doc.rect(margin, y, docWidth - margin * 2, 24, 'F')
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    doc.text('Gross Pay:', margin + 4, y + 7)
    doc.text(formatCurrency(data.grossPay), docWidth - margin - 4, y + 7, { align: 'right' })
    doc.text('Total Deductions:', margin + 4, y + 13)
    doc.text(formatCurrency(data.totalDeductions), docWidth - margin - 4, y + 13, { align: 'right' })
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(21, 128, 61)
    doc.text('Net Pay:', margin + 4, y + 20)
    doc.text(formatCurrency(data.netPay), docWidth - margin - 4, y + 20, { align: 'right' })

    doc.save(`payslip-${data.guard?.employeeNumber || data.id}.pdf`)
  } else if (type === 'inventory') {
    drawHeader('INVENTORY REPORT')
    const rows = (data as any[]).map((i) => [
      i.name,
      i.category,
      `${i.quantityOnHand} ${i.unit}`,
      formatCurrency(i.unitCost),
      formatCurrency(i.totalValue),
      i.lowStock ? 'Low Stock' : 'OK',
    ])
    const totalValue = (data as any[]).reduce((s, i) => s + Number(i.totalValue || 0), 0)
    rows.push(['', '', '', 'Total Value', formatCurrency(totalValue), ''])
    drawTable(
      ['Item', 'Category', 'Qty on Hand', 'Unit Cost', 'Total Value', 'Status'],
      rows,
      [45, 35, 30, 30, 30, 22],
      ['left', 'left', 'left', 'right', 'right', 'left'],
      42,
      'INVENTORY REPORT'
    )
    doc.save(`inventory-report-${formatDate(new Date())}.pdf`)
  } else if (type === 'assets') {
    drawHeader('FIXED ASSETS REPORT')
    const rows = (data as any[]).map((a) => [
      a.name,
      a.category,
      formatDate(a.purchaseDate),
      formatCurrency(a.purchasePrice),
      formatCurrency(a.accumulatedDepreciation),
      formatCurrency(a.currentValue),
      a.status,
    ])
    const totals = (data as any[]).reduce(
      (acc, a) => ({ price: acc.price + Number(a.purchasePrice || 0), dep: acc.dep + Number(a.accumulatedDepreciation || 0), value: acc.value + Number(a.currentValue || 0) }),
      { price: 0, dep: 0, value: 0 }
    )
    rows.push(['', '', 'Totals', formatCurrency(totals.price), formatCurrency(totals.dep), formatCurrency(totals.value), ''])
    drawTable(
      ['Asset', 'Category', 'Purchase Date', 'Purchase Price', 'Accum. Dep.', 'Net Book Value', 'Status'],
      rows,
      [40, 28, 26, 28, 26, 28, 16],
      ['left', 'left', 'left', 'right', 'right', 'right', 'left'],
      42,
      'FIXED ASSETS REPORT'
    )
    doc.save(`fixed-assets-report-${formatDate(new Date())}.pdf`)
  }
}
