'use client'

import React, { useEffect, useState, useRef } from 'react'
import InvoiceToolbar from './InvoiceToolbar'
import { generateInvoiceHtml } from '@/lib/invoice-pdf'
import toast from 'react-hot-toast'

type Company = any
type Invoice = any

export default function InvoiceView({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [invRes, compRes] = await Promise.all([
          fetch(`/api/finance/sales-invoices/${invoiceId}`).then(r => r.json()),
          fetch('/api/settings').then(r => r.json()),
        ])
        if (invRes.invoice) setInvoice(invRes.invoice)
        if (compRes.company) setCompany(compRes.company)
      } catch {
        toast.error('Network error loading invoice')
      }
    }
    load()
  }, [invoiceId])

  useEffect(() => {
    if (!company || !containerRef.current) return
    const root = containerRef.current
    root.style.setProperty('--primary-color', company.primaryColor || '#0b5fff')
    root.style.setProperty('--secondary-color', company.secondaryColor || '#f5f7fa')
    root.style.setProperty('--accent-color', company.accentColor || '#06b6d4')
    root.style.setProperty('--background-color', '#ffffff')
    root.style.setProperty('--border-color', '#e6e9ef')
    root.style.setProperty('--text-color', '#0f172a')
  }, [company])

  const handleDownloadPdf = async () => {
    // For now open HTML preview generated server-side
    try {
      const res = await fetch(`/api/finance/sales-invoices/${invoiceId}?action=pdf`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to generate PDF'); return }
      const html = generateInvoiceHtml(data.invoice, company)
      const w = window.open('', '_blank')
      if (w) {
        w.document.open()
        w.document.write(html)
        w.document.close()
      }
    } catch {
      toast.error('Network error generating PDF')
    }
  }

  const handlePrint = () => {
    if (!containerRef.current) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(containerRef.current.innerHTML)
    w.document.close()
    w.print()
  }

  const handlePreview = () => {
    // simple preview in modal or new tab
    if (!invoice || !company) return
    const html = generateInvoiceHtml(invoice, company)
    const w = window.open('', '_blank')
    if (w) {
      w.document.open()
      w.document.write(html)
      w.document.close()
    }
  }

  if (!invoice || !company) return <div>Loading invoice...</div>

  const taxEnabled = company.taxEnabled ?? company.showVat ?? true
  const taxName = company.taxName || 'Tax'

  // Apply CSS variables from company settings
  return (
    <div>
      <InvoiceToolbar
        invoiceId={invoiceId}
        onPreview={handlePreview}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
        onEmail={() => alert('Email flow not implemented yet')}
        onWhatsApp={() => alert('WhatsApp flow not implemented yet')}
        onDuplicate={() => alert('Duplicate not implemented')}
        onVoid={() => alert('Void action not implemented')}
      />

      <div ref={containerRef} className="invoice-container bg-white p-6 rounded-md shadow-sm">
        <header className="invoice-header flex items-center justify-between pb-6 border-b">
          <div className="flex items-center gap-4">
            {company.logo ? <img src={company.logo} alt={company.name} className="h-16 w-auto object-contain" /> : <div className="h-16 w-40 bg-gray-100 flex items-center justify-center">Logo</div>}
            <div>
              <h2 className="text-xl font-semibold invoice-text-color">{company.name}</h2>
              {company.motto && <div className="text-sm text-slate-600">{company.motto}</div>}
              <div className="text-sm text-slate-500 mt-1">{company.address}</div>
              <div className="text-sm text-slate-500">{company.phone} | {company.email} | {company.website}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="invoice-badge px-4 py-2 rounded">
              <div className="text-sm">Invoice</div>
              <div className="text-2xl font-bold">{invoice.invoice_number}</div>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              <div>Invoice Date: {invoice.invoice_date}</div>
              <div>Due Date: {invoice.due_date}</div>
              <div>Status: {invoice.status}</div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 my-6">
          <div>
            <h3 className="text-sm font-semibold">Bill To</h3>
            <div className="mt-2 text-sm">
              <div className="font-medium">{invoice.customer_name}</div>
              <div>{invoice.customer_id}</div>
              <div>{invoice.overall_description}</div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Invoice Details</h3>
            <div className="mt-2 text-sm">
              <div>Reference: {invoice.reference}</div>
              <div>Currency: {invoice.currency || company.currency}</div>
              <div>Generated By: {invoice.created_by}</div>
            </div>
          </div>
        </section>

        <section>
          <table className="w-full table-auto border-collapse invoice-table">
            <thead>
              <tr className="invoice-table-head-row">
                <th className="text-left p-3">Item</th>
                <th className="text-left p-3">Description</th>
                <th className="text-left p-3">Qty</th>
                <th className="text-right p-3">Rate</th>
                {taxEnabled && <th className="text-right p-3">{taxName}</th>}
                <th className="text-right p-3">Discount</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems && invoice.lineItems.length > 0 ? (
                invoice.lineItems.map((line: any, idx: number) => (
                  <tr key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-3 align-top">{idx + 1}</td>
                    <td className="p-3">{line.description}</td>
                    <td className="p-3 align-top">{line.quantity}</td>
                    <td className="p-3 text-right align-top">{line.unitPrice.toFixed(2)}</td>
                    {taxEnabled && <td className="p-3 text-right align-top">{(line.taxRate || 0).toFixed(2)}%</td>}
                    <td className="p-3 text-right align-top">{(line.discount || 0).toFixed(2)}</td>
                    <td className="p-3 text-right align-top">{line.lineTotal.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={taxEnabled ? 7 : 6} className="p-4 text-center text-sm text-slate-500">No items</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-6 flex justify-end">
          <div className="w-1/3">
            <div className="flex justify-between py-2 border-b invoice-summary-row">
              <div>Subtotal</div>
              <div>{(invoice.subtotal || 0).toFixed(2)}</div>
            </div>
            <div className="flex justify-between py-2 border-b invoice-summary-row">
              <div>Discount</div>
              <div>{(invoice.discount_amount || 0).toFixed(2)}</div>
            </div>
            {taxEnabled && (
              <div className="flex justify-between py-2 border-b invoice-summary-row">
                <div>{taxName}</div>
                <div>{(invoice.tax_amount || 0).toFixed(2)}</div>
              </div>
            )}
            <div className="flex justify-between py-3 font-semibold text-lg invoice-grand-total">
              <div>Grand Total</div>
              <div>{(invoice.total_amount || 0).toFixed(2)}</div>
            </div>
            <div className="flex justify-between py-2">
              <div>Amount Paid</div>
              <div>{(invoice.amount_paid || 0).toFixed(2)}</div>
            </div>
            <div className="flex justify-between py-2 font-medium">
              <div>Balance Due</div>
              <div>{(invoice.balance_due || 0).toFixed(2)}</div>
            </div>
          </div>
        </section>

        <footer className="mt-8 border-t pt-4 invoice-footer">
          <div className="text-sm text-slate-600">{company.footerMessage}</div>
          <div className="mt-3 text-sm text-slate-500">Bank: {company.bankName} | A/C: {company.bankAccountNumber}</div>
        </footer>
      </div>
    </div>
  )
}
