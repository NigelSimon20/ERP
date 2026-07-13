'use client'

import { useState, useEffect, useRef } from 'react'
import { FaFilePdf, FaFileWord, FaFileExcel, FaFileImage, FaFolder, FaSearch, FaUpload, FaTh, FaList, FaDownload, FaLink, FaTrash, FaFileAlt } from 'react-icons/fa'
import { MdClose } from 'react-icons/md'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

interface FileRecord {
  id: string
  originalName: string
  fileName: string
  fileUrl: string
  fileSize: number
  mimeType: string
  folder: string
  linkedModule: string | null
  linkedId: string | null
  uploaderName: string
  createdAt: string
}

const FOLDERS = [
  { key: 'general',            label: 'General' },
  { key: 'contracts',          label: 'Contracts' },
  { key: 'incident-reports',   label: 'Incident Reports' },
  { key: 'guard-documents',    label: 'Guard Documents' },
  { key: 'site-documents',     label: 'Site Documents' },
  { key: 'financial-documents',label: 'Financial Documents' },
  { key: 'other',              label: 'Other' },
]

const LINK_MODULES = [
  { label: 'Customer',  value: 'Customer',  endpoint: '/api/bd/customers',             responseKey: 'customers',  displayKey: 'name' },
  { label: 'Guard',     value: 'Guard',     endpoint: '/api/hr/employees',             responseKey: 'employees',  displayKey: 'name' },
  { label: 'Site',      value: 'Site',      endpoint: '/api/operations/sites',         responseKey: 'sites',      displayKey: 'name' },
  { label: 'Invoice',   value: 'Invoice',   endpoint: '/api/finance/sales-invoices',   responseKey: 'invoices',   displayKey: 'invoiceNumber' },
  { label: 'Incident',  value: 'Incident',  endpoint: '/api/operations/incidents',     responseKey: 'incidents',  displayKey: 'title' },
]

const ALLOWED_EXTENSIONS = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ mimeType, fileUrl, size = 40 }: { mimeType: string; fileUrl: string; size?: number }) {
  const imgCls = size <= 20 ? 'w-5 h-5 object-cover rounded' : size <= 36 ? 'w-9 h-9 object-cover rounded' : 'w-10 h-10 object-cover rounded'
  if (mimeType.startsWith('image/')) {
    return <img src={fileUrl} alt="" className={imgCls} />
  }
  if (mimeType === 'application/pdf') return <FaFilePdf size={size} className="text-red-500" />
  if (mimeType.includes('wordprocessingml')) return <FaFileWord size={size} className="text-blue-500" />
  if (mimeType.includes('spreadsheetml')) return <FaFileExcel size={size} className="text-green-600" />
  return <FaFileImage size={size} className="text-gray-400" />
}

export default function FileManagerPage() {
  const [activeFolder, setActiveFolder] = useState('general')
  const [files, setFiles] = useState<FileRecord[]>([])
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({})
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [menuFile, setMenuFile] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null)
  const [linkTarget, setLinkTarget] = useState<FileRecord | null>(null)
  const [linkModule, setLinkModule] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [linkRecords, setLinkRecords] = useState<Array<{ id: string; label: string }>>([])
  const [linkFetching, setLinkFetching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchFiles() {
    setLoading(true)
    const p = new URLSearchParams({ folder: activeFolder })
    if (search) p.set('search', search)
    try {
      const res = await fetch(`/api/files?${p}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load files'); setFiles([]); setFolderCounts({}); return }
      setFiles(json.files ?? [])
      setFolderCounts(json.folderCounts ?? {})
    } catch {
      toast.error('Network error loading files')
      setFiles([])
      setFolderCounts({})
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchFiles() }, [activeFolder])

  function uploadFile(file: File) {
    const MAX = 10 * 1024 * 1024
    if (file.size > MAX) { toast.error('File exceeds 10 MB'); return }

    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', activeFolder)

    setUploading(true)
    setUploadProgress(0)

    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      setUploading(false)
      setUploadProgress(0)
      if (xhr.status === 201) { toast.success('File uploaded'); fetchFiles() }
      else {
        try { toast.error(JSON.parse(xhr.responseText).error ?? 'Upload failed') }
        catch { toast.error('Upload failed') }
      }
    }
    xhr.onerror = () => { setUploading(false); toast.error('Upload failed') }
    xhr.open('POST', '/api/files')
    xhr.send(fd)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  async function deleteFile() {
    if (!deleteTarget) return
    const res = await fetch(`/api/files/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('File deleted'); fetchFiles() }
    else toast.error('Delete failed')
    setDeleteTarget(null)
  }

  useEffect(() => {
    if (!linkModule || !linkSearch.trim()) { setLinkRecords([]); return }
    const mod = LINK_MODULES.find(m => m.value === linkModule)
    if (!mod) return

    const controller = new AbortController()
    setLinkFetching(true)
    fetch(`${mod.endpoint}?search=${encodeURIComponent(linkSearch)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(j => {
        const items = j[mod.responseKey] ?? []
        setLinkRecords(items.map((item: Record<string, string>) => ({ id: item.id, label: item[mod.displayKey] ?? item.id })))
      })
      .catch(() => {})
      .finally(() => setLinkFetching(false))
    return () => controller.abort()
  }, [linkModule, linkSearch])

  async function saveLink(linkedId: string) {
    if (!linkTarget) return
    const res = await fetch(`/api/files/${linkTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedModule: linkModule, linkedId }),
    })
    if (res.ok) { toast.success('File linked'); fetchFiles(); setLinkTarget(null) }
    else toast.error('Failed to link')
  }

  const filteredFiles = search
    ? files.filter(f => f.originalName.toLowerCase().includes(search.toLowerCase()))
    : files

  const activeFolderLabel = FOLDERS.find(f => f.key === activeFolder)?.label ?? activeFolder

  return (
    <div className="flex gap-0 h-full">
      {/* Left panel — folder tree */}
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white rounded-l-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Folders</p>
        </div>
        <nav className="py-2">
          {FOLDERS.map(folder => (
            <button
              key={folder.key}
              type="button"
              onClick={() => { setActiveFolder(folder.key); setSearch('') }}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                activeFolder === folder.key
                  ? 'bg-red-50 text-[#CC0000] font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <FaFolder size={13} className={activeFolder === folder.key ? 'text-[#CC0000]' : 'text-gray-300'} />
                {folder.label}
              </span>
              {!!folderCounts[folder.key] && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center ${
                  activeFolder === folder.key ? 'bg-[#CC0000] text-white' : 'bg-gray-100 text-gray-500'
                }`}>{folderCounts[folder.key]}</span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Right panel */}
      <div className="flex-1 min-w-0 flex flex-col bg-white rounded-r-lg border-t border-r border-b border-gray-200">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
          <h2 className="font-semibold text-[#0D1B2A] text-sm shrink-0">{activeFolderLabel}</h2>
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchFiles()}
              placeholder="Search files…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <button type="button" onClick={() => setView('grid')} className={`p-1.5 rounded ${view === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`} aria-label="Grid view"><FaTh className="h-4 w-4 text-gray-500" /></button>
            <button type="button" onClick={() => setView('list')} className={`p-1.5 rounded ${view === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`} aria-label="List view"><FaList className="h-4 w-4 text-gray-500" /></button>
            <Button
              type="button"
              size="sm"
              className="ml-2 bg-[#CC0000] hover:bg-[#AA0000] text-white h-8"
              onClick={() => fileInputRef.current?.click()}
            >
              <FaUpload className="h-3.5 w-3.5 mr-1" /> Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS}
              className="hidden"
              aria-label="Choose file to upload"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }}
            />
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`mx-4 mt-3 rounded-lg border-2 border-dashed transition-colors text-center py-4 ${
            isDragging ? 'border-[#CC0000] bg-red-50' : 'border-gray-200 bg-gray-50'
          }`}
        >
          {uploading ? (
            <div className="px-6">
              <p className="text-xs text-gray-500 mb-2">Uploading… {uploadProgress}%</p>
              <svg width="100%" height="6" className="rounded-full overflow-hidden">
                <rect x="0" y="0" width="100%" height="6" fill="#E5E7EB" rx="3" />
                <rect x="0" y="0" width={`${uploadProgress}%`} height="6" fill="#CC0000" rx="3" />
              </svg>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              <span className="font-medium text-gray-600">Drag &amp; drop</span> a file here, or{' '}
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[#CC0000] underline">browse</button>
              <br />PDF, DOCX, XLSX, JPG, PNG · Max 10 MB
            </p>
          )}
        </div>

        {/* File content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
          ) : filteredFiles.length === 0 ? (
            <EmptyState icon={FaFileAlt} title="No files" description={`Upload files to the ${activeFolderLabel} folder`} action={{ label: 'Upload File', onClick: () => fileInputRef.current?.click() }} />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredFiles.map(file => (
                <div key={file.id} className="relative group rounded-lg border border-gray-200 bg-white p-3 hover:shadow-md transition-shadow flex flex-col gap-2">
                  <div className="flex items-center justify-center h-12">
                    <FileIcon mimeType={file.mimeType} fileUrl={file.fileUrl} size={36} />
                  </div>
                  <p className="text-xs font-medium text-[#0D1B2A] truncate text-center" title={file.originalName}>{file.originalName}</p>
                  <p className="text-xs text-gray-400 text-center">{formatBytes(file.fileSize)}</p>
                  {/* Actions */}
                  <div className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm">
                    <a href={file.fileUrl} download={file.originalName} className="p-1 hover:bg-gray-50 rounded-l-md" aria-label="Download"><FaDownload className="h-3 w-3 text-gray-500" /></a>
                    <button type="button" onClick={() => { setLinkTarget(file); setLinkModule(''); setLinkSearch('') }} className="p-1 hover:bg-gray-50" aria-label="Link to record"><FaLink className="h-3 w-3 text-gray-500" /></button>
                    <button type="button" onClick={() => setDeleteTarget(file)} className="p-1 hover:bg-red-50 rounded-r-md" aria-label="Delete"><FaTrash className="h-3 w-3 text-red-400" /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Size</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Folder</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Linked To</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Uploaded By</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Date</th>
                  <th className="px-3 py-2 font-medium text-gray-600 text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFiles.map(file => (
                  <tr key={file.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileIcon mimeType={file.mimeType} fileUrl={file.fileUrl} size={18} />
                        <span className="text-xs font-medium text-[#0D1B2A] max-w-[160px] truncate" title={file.originalName}>{file.originalName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">
                      {file.mimeType.includes('pdf') ? 'PDF' : file.mimeType.includes('word') ? 'DOCX' : file.mimeType.includes('sheet') ? 'XLSX' : file.mimeType.startsWith('image/') ? 'Image' : 'File'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{formatBytes(file.fileSize)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{FOLDERS.find(f => f.key === file.folder)?.label ?? file.folder}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{file.linkedModule ? `${file.linkedModule} #${file.linkedId?.slice(0, 8)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{file.uploaderName}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{formatDate(file.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <a href={file.fileUrl} download={file.originalName} className="p-1 rounded hover:bg-gray-100" aria-label="Download"><FaDownload className="h-3.5 w-3.5 text-gray-400" /></a>
                        <button type="button" onClick={() => { setLinkTarget(file); setLinkModule(''); setLinkSearch('') }} className="p-1 rounded hover:bg-gray-100" aria-label="Link"><FaLink className="h-3.5 w-3.5 text-gray-400" /></button>
                        <button type="button" onClick={() => setDeleteTarget(file)} className="p-1 rounded hover:bg-red-50" aria-label="Delete"><FaTrash className="h-3.5 w-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete File</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Are you sure you want to delete <strong>{deleteTarget?.originalName}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button type="button" onClick={deleteFile} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Record dialog */}
      <Dialog open={!!linkTarget} onOpenChange={o => !o && setLinkTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Link to Record</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Linking <strong>{linkTarget?.originalName}</strong> to a record.</p>
            <div className="space-y-1.5">
              <Label>Module</Label>
              <select
                value={linkModule}
                onChange={e => { setLinkModule(e.target.value); setLinkSearch(''); setLinkRecords([]) }}
                className="w-full h-9 rounded-md border border-gray-300 px-2 text-sm"
                aria-label="Select module"
              >
                <option value="">Select module…</option>
                {LINK_MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {linkModule && (
              <div className="space-y-1.5">
                <Label>Search</Label>
                <Input
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Type to search…"
                />
                {linkFetching && <p className="text-xs text-gray-400">Searching…</p>}
                {linkRecords.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y">
                    {linkRecords.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => saveLink(r.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
                {!linkFetching && linkSearch && linkRecords.length === 0 && (
                  <p className="text-xs text-gray-400">No results found</p>
                )}
              </div>
            )}
            {linkTarget?.linkedModule && (
              <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
                <span>Currently linked to: <strong>{linkTarget.linkedModule}</strong></span>
                <button
                  type="button"
                  onClick={async () => { await saveLink(''); setLinkTarget(null) }}
                  className="flex items-center gap-1 text-red-500 hover:text-red-700"
                >
                  <MdClose className="h-3 w-3" /> Remove link
                </button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
