'use client'

import React from 'react'
import InvoiceView from '@/components/invoice/InvoiceView'

export default function SalesInvoicePage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6">
      <InvoiceView invoiceId={params.id} />
    </div>
  )
}
