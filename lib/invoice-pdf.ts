export function generateInvoiceHtml(invoice: any, company: any) {
  const primary = company.primaryColor || '#0b5fff'
  const secondary = company.secondaryColor || '#f5f7fa'
  const accent = company.accentColor || '#06b6d4'

  const lines = (invoice.lineItems || []).map((l: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:8px">${i + 1}</td>
      <td style="padding:8px">${escapeHtml(l.description)}</td>
      <td style="padding:8px">${l.quantity}</td>
      <td style="padding:8px;text-align:right">${(l.unitPrice||0).toFixed(2)}</td>
      <td style="padding:8px;text-align:right">${(l.taxRate||0).toFixed(2)}%</td>
      <td style="padding:8px;text-align:right">${(l.discount||0).toFixed(2)}</td>
      <td style="padding:8px;text-align:right">${(l.lineTotal||0).toFixed(2)}</td>
    </tr>
  `).join('\n')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${invoice.invoice_number}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root{--primary:${primary};--secondary:${secondary};--accent:${accent};--text:#0f172a}
    body{font-family: Inter, Arial, Helvetica, sans-serif; color:var(--text); padding:24px}
    .header{display:flex;justify-content:space-between;align-items:center}
    .company{max-width:60%}
    table{width:100%;border-collapse:collapse}
    th{background:var(--secondary);text-align:left;padding:10px}
    td{padding:8px;border-bottom:1px solid #eee}
    .grand{color:var(--primary);font-weight:700}
  </style></head><body>
    <div class="header">
      <div class="company">
        ${company.logo ? `<img src="${company.logo}" style="height:60px;object-fit:contain" />` : ''}
        <h1>${escapeHtml(company.name)}</h1>
        <div>${escapeHtml(company.address || '')}</div>
      </div>
      <div class="invoice-meta" style="text-align:right">
        <div style="background:var(--primary);color:#fff;padding:12px;border-radius:6px"><strong>Invoice</strong><div style="font-size:18px">${escapeHtml(invoice.invoice_number)}</div></div>
        <div style="margin-top:8px">Date: ${escapeHtml(invoice.invoice_date || '')}</div>
        <div>Due: ${escapeHtml(invoice.due_date || '')}</div>
      </div>
    </div>

    <hr style="margin:18px 0;border:none;border-top:1px solid #eee" />

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th>Qty</th>
          <th style="text-align:right">Rate</th>
          <th style="text-align:right">Tax</th>
          <th style="text-align:right">Discount</th>
          <th style="text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lines}
      </tbody>
    </table>

    <div style="width:300px;margin-left:auto;margin-top:12px">
      <div style="display:flex;justify-content:space-between;padding:8px;border-top:1px solid #eee"><div>Subtotal</div><div>${(invoice.subtotal||0).toFixed(2)}</div></div>
      <div style="display:flex;justify-content:space-between;padding:8px;border-top:1px solid #eee"><div>Discount</div><div>${(invoice.discount_amount||0).toFixed(2)}</div></div>
      <div style="display:flex;justify-content:space-between;padding:8px;border-top:1px solid #eee"><div>VAT</div><div>${(invoice.tax_amount||0).toFixed(2)}</div></div>
      <div style="display:flex;justify-content:space-between;padding:12px;font-weight:700;color:var(--primary)"><div>Grand Total</div><div>${(invoice.total_amount||0).toFixed(2)}</div></div>
    </div>

    <footer style="margin-top:18px;border-top:1px solid #eee;padding-top:12px;color:#6b7280">
      <div>${escapeHtml(company.footerMessage || '')}</div>
      <div style="margin-top:6px">Bank: ${escapeHtml(company.bankName || '')} | A/C: ${escapeHtml(company.bankAccountNumber || '')}</div>
    </footer>
  </body></html>`
}

function escapeHtml(s: any) {
  if (s === undefined || s === null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
