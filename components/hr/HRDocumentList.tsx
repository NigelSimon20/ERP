'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { AddRegular as Plus, ArrowDownloadRegular as Download, ClockRegular as Clock, DeleteRegular as Trash2, DocumentTextRegular as FileText, ErrorCircleRegular as AlertCircle } from '@fluentui/react-icons';

interface HRDocument {
  id: string
  title: string
  documentType: string
  fileUrl: string
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

interface GuardOption { id: string; name: string | null }

const ALLOWED_EXTENSIONS = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png'

type UploadedFile = { fileUrl: string; fileName: string; fileSize: number; mimeType: string }
type FormState = { title: string; documentType: string; guardId: string; expiryDate: string; notes: string }

const EMPTY_FORM: FormState = { title: '', documentType: '', guardId: '', expiryDate: '', notes: '' }

export function HRDocumentList() {
  const [documents, setDocuments] = useState<HRDocument[]>([])
  const [expiringDocs, setExpiringDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [guards, setGuards] = useState<GuardOption[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchDocuments()
  }, [page])

  useEffect(() => {
    fetch('/api/hr/employees')
      .then((r) => r.json())
      .then((j) => setGuards(j.guards ?? []))
      .catch(() => {})
  }, [])

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

  function openUpload() {
    setForm(EMPTY_FORM)
    setUploadedFile(null)
    setShowDialog(true)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'guard-documents')
      const res = await fetch('/api/files', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Upload failed'); return }
      setUploadedFile({
        fileUrl: `/api/files/${json.file.id}/download`,
        fileName: json.file.originalName,
        fileSize: json.file.fileSize,
        mimeType: json.file.mimeType,
      })
      if (!form.title) setForm((f) => ({ ...f, title: json.file.originalName }))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function saveDocument() {
    if (!uploadedFile) { toast.error('Choose a file to upload first'); return }
    if (!form.title || !form.documentType) { toast.error('Title and document type are required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...uploadedFile,
          title: form.title,
          documentType: form.documentType,
          guardId: form.guardId || undefined,
          expiryDate: form.expiryDate || undefined,
          notes: form.notes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to save document'); return }
      toast.success('Document uploaded')
      setShowDialog(false)
      fetchDocuments()
    } finally {
      setSaving(false)
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
        <Button className="flex gap-2" onClick={openUpload}>
          <Plus fontSize={18} />
          Upload Document
        </Button>
      </div>

      {expiringDocs.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex gap-2 items-start">
              <AlertCircle className="text-yellow-600 mt-1" fontSize={20} />
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
                  <FileText fontSize={24} className="text-brand-muted-light mt-1" />
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
                  <p className="text-muted-foreground">File</p>
                  <p className="font-medium">{doc.fileName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p className="font-medium">{formatFileSize(doc.fileSize)}</p>
                </div>
                {doc.guard && (
                  <div>
                    <p className="text-muted-foreground">Employee</p>
                    <p className="font-medium">{doc.guard.full_name}</p>
                  </div>
                )}
                {doc.expiryDate && (
                  <div>
                    <p className="text-muted-foreground">Expires</p>
                    <p className="font-medium">{new Date(doc.expiryDate).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Uploaded</p>
                  <p className="font-medium">{new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex gap-2" onClick={() => window.open(doc.fileUrl, '_blank')}>
                  <Download fontSize={16} />
                  Download
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex gap-2"
                  onClick={() => handleDelete(doc.id)}
                >
                  <Trash2 fontSize={16} />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>File *</Label>
              {uploadedFile ? (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="truncate">{uploadedFile.fileName}</span>
                  <button type="button" className="text-xs text-primary underline shrink-0 ml-2" onClick={() => fileInputRef.current?.click()}>Change</button>
                </div>
              ) : (
                <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="w-full">
                  {uploading ? 'Uploading…' : 'Choose File'}
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS} className="hidden" aria-label="Choose file to upload" onChange={handleFileChange} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title *</Label>
              <Input id="doc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. National ID Copy" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Document Type *</Label>
              <Input id="doc-type" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} placeholder="e.g. ID Copy, Certificate, Contract" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="doc-guard">Employee</Label>
                <select id="doc-guard" title="Employee" value={form.guardId} onChange={(e) => setForm({ ...form, guardId: e.target.value })} className="w-full h-9 rounded-md border border-border px-2 text-sm bg-background">
                  <option value="">Not linked to an employee</option>
                  {guards.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-expiry">Expiry Date</Label>
                <Input id="doc-expiry" type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-notes">Notes</Label>
              <Input id="doc-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button type="button" disabled={saving || uploading} onClick={saveDocument} className="bg-primary hover:bg-brand-red-dark text-white">{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
