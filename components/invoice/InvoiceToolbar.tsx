'use client'

import React from 'react'

type Props = {
  invoiceId: string
  onPreview?: () => void
  onDownloadPdf?: () => void
  onPrint?: () => void
  onEmail?: () => void
  onWhatsApp?: () => void
  onDuplicate?: () => void
  onVoid?: () => void
}

export default function InvoiceToolbar({ invoiceId, onPreview, onDownloadPdf, onPrint, onEmail, onWhatsApp, onDuplicate, onVoid }: Props) {
  return (
    <div className="flex items-center justify-end gap-2 mb-4">
      <button onClick={onPreview} className="btn btn-outline">Preview</button>
      <button onClick={onDownloadPdf} className="btn btn-primary">Download PDF</button>
      <button onClick={onPrint} className="btn">Print</button>
      <button onClick={onEmail} className="btn btn-secondary">Email</button>
      <button onClick={onWhatsApp} className="btn btn-ghost">WhatsApp</button>
      <button onClick={onDuplicate} className="btn">Duplicate</button>
      <button onClick={onVoid} className="btn btn-danger">Void</button>
    </div>
  )
}
