'use client'

import { HRDocumentList } from '@/components/hr/HRDocumentList'

export default function DocumentsPage() {
  return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">HR Documents</h1>
          <p className="text-gray-500 mt-2">Manage employee documents and certifications</p>
        </div>
        <HRDocumentList />
      </div>
  )
}
