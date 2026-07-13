'use client'

import { useState, useEffect } from 'react'
import { LuPlus as Plus, LuFileText as FileText, LuClock as Clock, LuTrash2 as Trash2, LuDownload as Download, LuCircleAlert as AlertCircle } from 'react-icons/lu'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface HRDocument {
  id: string
  title: string
  documentType: string
  fileName: string
  fileSize: number
  expiryDate?: string
  uploadedBy: string
  createdAt: string
  guard?: {
    full_name?: string
    employee_code?: string
  }
}

export function HRDocumentList() {
  const [documents, setDocuments] = useState<HRDocument[]>([])
  const [expiringDocs, setExpiringDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchDocuments()
  }, [page])

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/hr/documents?page=${page}`)
      const data = await res.json()
      setDocuments(data.documents)
      setExpiringDocs(data.expiringDocuments)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return
    try {
      await fetch(`/api/hr/documents/${id}`, { method: 'DELETE' })
      fetchDocuments()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const isExpired = (date?: string) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  const isExpiring = (date?: string) => {
    if (!date) return false
    const now = new Date()
    const expiry = new Date(date)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">HR Documents</h2>
        <Button className="flex gap-2">
          <Plus size={18} />
          Upload Document
        </Button>
      </div>

      {expiringDocs.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex gap-2 items-start">
              <AlertCircle className="text-yellow-600 mt-1" size={20} />
              <div>
                <p className="font-semibold text-yellow-800">{expiringDocs.length} documents expiring soon</p>
                <p className="text-sm text-yellow-700">Review and renew documents that expire within 30 days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {documents.map((doc) => (
          <Card key={doc.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex gap-3 items-start">
                  <FileText size={24} className="text-gray-400 mt-1" />
                  <div>
                    <CardTitle className="text-lg">{doc.title}</CardTitle>
                    <CardDescription>{doc.documentType}</CardDescription>
                  </div>
                </div>
                {isExpired(doc.expiryDate) && <Badge variant="destructive">Expired</Badge>}
                {isExpiring(doc.expiryDate) && <Badge className="bg-yellow-100 text-yellow-800">Expiring Soon</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-500">File</p>
                  <p className="font-medium">{doc.fileName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Size</p>
                  <p className="font-medium">{formatFileSize(doc.fileSize)}</p>
                </div>
                {doc.guard && (
                  <div>
                    <p className="text-gray-500">Employee</p>
                    <p className="font-medium">{doc.guard.full_name}</p>
                  </div>
                )}
                {doc.expiryDate && (
                  <div>
                    <p className="text-gray-500">Expires</p>
                    <p className="font-medium">{new Date(doc.expiryDate).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500">Uploaded</p>
                  <p className="font-medium">{new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex gap-2">
                  <Download size={16} />
                  Download
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex gap-2"
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
