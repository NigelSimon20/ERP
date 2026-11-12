'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { DocumentRegular } from '@fluentui/react-icons'

// A3: statutory rate tables (PAYE, AIDS Levy, NSSA, NEC, ZIMDEF) are entered
// from their source document and only take effect once someone other than
// the person who entered them approves them. No rates are built into the
// code: until a table is approved, payroll previews show a warning.

interface StatutoryTable {
  id: string
  kind: string
  currency: string
  effectiveFrom: string
  effectiveTo: string | null
  config: unknown
  sourceDocument: string
  status: string
  createdBy: string
  approvedBy: string | null
  approvedAt: string | null
}

const KINDS = ['PAYE', 'AIDS_LEVY', 'NSSA', 'NEC', 'ZIMDEF'] as const
const LABELS: Record<string, string> = { PAYE: 'PAYE bands', AIDS_LEVY: 'AIDS Levy', NSSA: 'NSSA', NEC: 'NEC (security industry)', ZIMDEF: 'ZIMDEF / SDL' }
// The shape each table expects. Placeholders only — replace every value with
// the figures from the source document.
const TEMPLATES: Record<string, unknown> = {
  PAYE: { bands: [{ upTo: 0, rate: 0, deduct: 0 }, { upTo: null, rate: 0, deduct: 0 }] },
  AIDS_LEVY: { rateOfPaye: 0 },
  NSSA: { employeeRate: 0, employerRate: 0, insurableCeiling: 0 },
  NEC: { employeeRate: 0, employerRate: 0, gradeMinimums: { Guard: 0 } },
  ZIMDEF: { employerRate: 0 },
}
const HELP: Record<string, string> = {
  PAYE: 'Bands in ascending order. Tax = taxable × rate% − deduct, for the first band whose upTo is at least the taxable pay; the last band has upTo null.',
  AIDS_LEVY: 'rateOfPaye: percentage of PAYE.',
  NSSA: 'Percentages of gross pay, capped at insurableCeiling.',
  NEC: 'Levy percentages, and the minimum basic pay per grade (the guard’s employee type). Pay below the minimum shows a warning.',
  ZIMDEF: 'Employer percentage of gross pay.',
}

export default function StatutoryTablesPage() {
  const [tables, setTables] = useState<StatutoryTable[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<string>('PAYE')
  const [currency, setCurrency] = useState('USD')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [sourceDocument, setSourceDocument] = useState('')
  const [config, setConfig] = useState(JSON.stringify(TEMPLATES.PAYE, null, 2))
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/hr/statutory-tables')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load statutory tables'); return }
      setTables(json.tables ?? [])
    } catch {
      toast.error('Network error loading statutory tables')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function chooseKind(k: string) {
    setKind(k)
    setConfig(JSON.stringify(TEMPLATES[k], null, 2))
  }

  async function save() {
    let parsed: unknown
    try { parsed = JSON.parse(config) } catch { toast.error('The rates are not valid JSON'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/hr/statutory-tables', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, currency, effectiveFrom, effectiveTo: effectiveTo || undefined, sourceDocument, config: parsed }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to save'); return }
      toast.success('Saved as a draft. Someone else must approve it before payroll uses it.')
      setSourceDocument(''); setEffectiveFrom(''); setEffectiveTo('')
      load()
    } finally { setSaving(false) }
  }

  async function approve(t: StatutoryTable) {
    const res = await fetch(`/api/hr/statutory-tables/${t.id}?action=approve`, { method: 'PUT' })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Failed to approve'); return }
    toast.success(`${LABELS[t.kind] ?? t.kind} approved`)
    load()
  }

  const approvedKinds = new Set(tables.filter((t) => t.status === 'APPROVED').map((t) => t.kind))
  const missing = KINDS.filter((k) => !approvedKinds.has(k))

  return (
    <div>
      <PageHeader title="Statutory Tables" description="PAYE, AIDS Levy, NSSA, NEC and ZIMDEF rates used by payroll" />

      {!loading && missing.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
          No approved table yet for: {missing.map((k) => LABELS[k]).join(', ')}. Payroll computes no deduction for these until one is approved.
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Add a table version</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Table *</Label>
            <Select value={kind} onValueChange={chooseKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{LABELS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Currency *</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZWG">ZWG</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Effective from *</Label><Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Effective to</Label><Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Source document *</Label>
          <Input placeholder="e.g. ZIMRA PAYE tax tables, Finance Act / SI number" value={sourceDocument} onChange={(e) => setSourceDocument(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Rates (JSON) *</Label>
          <Textarea rows={8} className="font-mono text-xs" value={config} onChange={(e) => setConfig(e.target.value)} />
          <p className="text-xs text-muted-foreground">{HELP[kind]} The template shows the shape only; enter the figures from the source document.</p>
        </div>
        <Button type="button" disabled={saving || !effectiveFrom || !sourceDocument} onClick={save} className="bg-primary hover:bg-brand-red-dark text-white">
          {saving ? 'Saving…' : 'Save as draft'}
        </Button>
      </div>

      <div className="mt-6">
        {tables.length === 0 && !loading ? (
          <EmptyState icon={DocumentRegular} title="No statutory tables" description="Add each table from its source document, then ask a colleague to approve it." />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Table</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Currency</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Effective</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tables.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{LABELS[t.kind] ?? t.kind}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.currency}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(new Date(t.effectiveFrom))}{t.effectiveTo ? ` – ${formatDate(new Date(t.effectiveTo))}` : ' onwards'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{t.sourceDocument}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${t.status === 'APPROVED' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.status === 'DRAFT' && <button type="button" onClick={() => approve(t)} className="text-xs font-medium text-primary hover:underline">Approve</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
