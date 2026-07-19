'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { FileDropzone } from './FileDropzone'
import type { FieldSpec, ImportMode, RowClassification } from '@/lib/import-export/types'

interface ParseResponse {
  fileId: string
  headers: string[]
  suggestions: { header: string; fieldKey: string | null; confidence: number }[]
  totalRows: number
  fields: FieldSpec[]
}

interface ValidatedRowWithId {
  id: string
  rowNumber: number
  classification: RowClassification
  errors: string[]
  mappedData: Record<string, unknown>
}

interface ValidateResponse {
  jobId: string
  totalRows: number
  validRows: number
  invalidRows: number
  rows: ValidatedRowWithId[]
}

const MODE_OPTIONS: { value: ImportMode; label: string; description: string }[] = [
  { value: 'CREATE', label: 'Create New Records', description: 'Only add rows that don’t already exist' },
  { value: 'UPDATE', label: 'Update Existing Records', description: 'Only update rows that match an existing record' },
  { value: 'UPSERT', label: 'Upsert (Create + Update)', description: 'Create new rows, update matching existing ones' },
  { value: 'PREVIEW_ONLY', label: 'Preview Only', description: 'Just show what would happen — don’t write anything' },
]

const CLASSIFICATION_STYLES: Record<RowClassification, string> = {
  NEW: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  DUPLICATE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  INVALID: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

type Step = 'upload' | 'mapping' | 'preview' | 'result'

interface ImportWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiBase: string // e.g. '/api/hr/employees/import'
  moduleLabel: string // e.g. 'Employees'
  onComplete: () => void
}

export function ImportWizardDialog({ open, onOpenChange, apiBase, moduleLabel, onComplete }: ImportWizardDialogProps) {
  const [step, setStep] = useState<Step>('upload')
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [mode, setMode] = useState<ImportMode>('CREATE')
  const [validateResult, setValidateResult] = useState<ValidateResponse | null>(null)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [commitResult, setCommitResult] = useState<{ successCount: number; failureCount: number } | null>(null)
  const [rolledBack, setRolledBack] = useState(false)

  function reset() {
    setStep('upload')
    setFileName(null)
    setParseResult(null)
    setMapping({})
    setMode('CREATE')
    setValidateResult(null)
    setExcludedIds(new Set())
    setCommitResult(null)
    setRolledBack(false)
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  async function handleFileSelected(file: File) {
    setBusy(true)
    setFileName(file.name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${apiBase}/parse`, { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to read file'); return }
      const parsed = json as ParseResponse
      setParseResult(parsed)
      const initialMapping: Record<string, string | null> = {}
      for (const s of parsed.suggestions) initialMapping[s.header] = s.fieldKey
      setMapping(initialMapping)
      setStep('mapping')
    } catch {
      toast.error('Network error reading file')
    } finally {
      setBusy(false)
    }
  }

  async function handleValidate() {
    if (!parseResult) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: parseResult.fileId, mapping, mode }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Validation failed'); return }
      setValidateResult(json as ValidateResponse)
      setExcludedIds(new Set())
      setStep('preview')
    } catch {
      toast.error('Network error validating file')
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    if (!validateResult) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: validateResult.jobId, excludeRowIds: Array.from(excludedIds) }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Import failed'); return }
      setCommitResult(json)
      setStep('result')
      onComplete()
    } catch {
      toast.error('Network error committing import')
    } finally {
      setBusy(false)
    }
  }

  async function handleRollback() {
    if (!validateResult) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/${validateResult.jobId}/rollback`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Rollback failed'); return }
      toast.success(`Rolled back: ${json.deleted} deleted, ${json.restored} restored`)
      setRolledBack(true)
      onComplete()
    } catch {
      toast.error('Network error rolling back import')
    } finally {
      setBusy(false)
    }
  }

  function toggleRow(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const counts = validateResult
    ? validateResult.rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.classification] = (acc[r.classification] ?? 0) + 1
        return acc
      }, {})
    : {}

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {moduleLabel}</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <FileDropzone onFileSelected={handleFileSelected} selectedFileName={fileName} />
            {busy && <p className="text-sm text-muted-foreground text-center">Reading file…</p>}
          </div>
        )}

        {step === 'mapping' && parseResult && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Import Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ImportMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {MODE_OPTIONS.find((m) => m.value === mode)?.description}
              </p>
            </div>

            <div>
              <Label>Column Mapping</Label>
              <p className="text-xs text-muted-foreground mb-2">
                We’ve suggested a mapping below — review and adjust before continuing. {parseResult.totalRows} row(s) found.
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">File Column</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Maps To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parseResult.headers.map((header) => (
                      <tr key={header}>
                        <td className="px-3 py-2 font-mono text-xs">{header}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={mapping[header] ?? '__skip__'}
                            onValueChange={(v) => setMapping((prev) => ({ ...prev, [header]: v === '__skip__' ? null : v }))}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__">— Do not import —</SelectItem>
                              {parseResult.fields.map((f) => (
                                <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && validateResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border border-border p-2">
                <p className="text-lg font-semibold">{validateResult.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="rounded-lg border border-border p-2">
                <p className="text-lg font-semibold text-green-600">{counts.NEW ?? 0}</p>
                <p className="text-xs text-muted-foreground">New</p>
              </div>
              <div className="rounded-lg border border-border p-2">
                <p className="text-lg font-semibold text-blue-600">{counts.UPDATE ?? 0}</p>
                <p className="text-xs text-muted-foreground">Update</p>
              </div>
              <div className="rounded-lg border border-border p-2">
                <p className="text-lg font-semibold text-red-600">{(counts.INVALID ?? 0) + (counts.DUPLICATE ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Invalid/Duplicate</p>
              </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Row</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Preview</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {validateResult.rows.map((row) => {
                    const committable = row.classification === 'NEW' || row.classification === 'UPDATE'
                    const preview = Object.entries(row.mappedData).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
                    return (
                      <tr key={row.id} className={!committable ? 'opacity-60' : ''}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={committable && !excludedIds.has(row.id)}
                            disabled={!committable}
                            onChange={() => toggleRow(row.id)}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_STYLES[row.classification]}`}>
                            {row.classification}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-xs">{preview}</td>
                        <td className="px-3 py-2 text-xs text-red-600">{row.errors.join('; ')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 'result' && commitResult && (
          <div className="space-y-4 text-center py-6">
            <CheckmarkCircleRegular className="h-12 w-12 text-green-600 mx-auto" />
            <div>
              <p className="text-lg font-semibold">Import Complete</p>
              <p className="text-sm text-muted-foreground mt-1">
                {commitResult.successCount} row(s) imported
                {commitResult.failureCount > 0 && `, ${commitResult.failureCount} failed`}
              </p>
            </div>
            {rolledBack && (
              <p className="text-sm text-amber-600 flex items-center justify-center gap-1">
                <ArrowClockwiseRegular className="h-4 w-4" /> This import has been rolled back
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'mapping' && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button type="button" disabled={busy} onClick={handleValidate} className="bg-primary hover:bg-brand-red-dark text-white">
                {busy ? 'Validating…' : 'Validate & Preview'}
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep('mapping')}>Back</Button>
              {mode !== 'PREVIEW_ONLY' && (
                <Button
                  type="button"
                  disabled={busy || (counts.NEW ?? 0) + (counts.UPDATE ?? 0) === 0}
                  onClick={handleCommit}
                  className="bg-primary hover:bg-brand-red-dark text-white"
                >
                  {busy ? 'Importing…' : <><ArrowUploadRegular className="h-4 w-4 mr-1" /> Commit Import</>}
                </Button>
              )}
            </>
          )}
          {step === 'result' && (
            <>
              {!rolledBack && (commitResult?.successCount ?? 0) > 0 && (
                <Button type="button" variant="outline" disabled={busy} onClick={handleRollback}>
                  {busy ? 'Rolling back…' : 'Undo This Import'}
                </Button>
              )}
              <Button type="button" onClick={() => handleClose(false)} className="bg-primary hover:bg-brand-red-dark text-white">
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
