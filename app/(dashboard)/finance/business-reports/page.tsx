'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowDownloadRegular, DataBarVerticalRegular } from '@fluentui/react-icons';

type ReportType = 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASHFLOW' | 'TAX_SUMMARY' | 'AGED_RECEIVABLES' | 'AGED_PAYABLES'

interface ReportResult { title: string; generatedAt: string; sections: { heading: string; rows: { label: string; amount: number; bold?: boolean }[] }[] }

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: 'INCOME_STATEMENT', label: 'Income Statement', description: 'Revenue, expenses and net profit/loss for the period' },
  { value: 'BALANCE_SHEET', label: 'Balance Sheet', description: 'Assets, liabilities and equity at a point in time' },
  { value: 'CASHFLOW', label: 'Cash Flow Statement', description: 'Cash inflows and outflows by activity type' },
  { value: 'TAX_SUMMARY', label: 'Tax Summary', description: 'VAT collected vs paid and net liability' },
  { value: 'AGED_RECEIVABLES', label: 'Aged Receivables', description: 'Outstanding customer invoices by age bucket' },
  { value: 'AGED_PAYABLES', label: 'Aged Payables', description: 'Outstanding supplier bills by age bucket' },
]

export default function BusinessReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('INCOME_STATEMENT')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(0, 1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)

  const selectedMeta = REPORT_TYPES.find(r => r.value === reportType)!

  async function generate() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: reportType, startDate, endDate })
      const res = await fetch(`/api/finance/reports/business?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Report generation failed'); setResult(null); return }
      setResult(json)
    } catch {
      toast.error('Network error generating report')
      setResult(null)
    } finally { setLoading(false) }
  }

  function downloadCSV() {
    if (!result) return
    const lines: string[] = [`"${result.title}"`, `"Generated: ${formatDate(new Date(result.generatedAt))}"`, '']
    for (const section of result.sections) {
      lines.push(`"${section.heading}"`)
      for (const row of section.rows) lines.push(`"${row.label}","${row.amount}"`)
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${reportType.toLowerCase()}.csv`; a.click()
  }

  async function downloadPdf() {
    if (!result) return
    try {
      const { exportReportPdf } = await import('@/lib/pdf')
      let company: any = {}
      try {
        const settingsRes = await fetch('/api/settings')
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json()
          company = settingsJson.company ?? {}
        }
      } catch { /* use defaults */ }
      // Map business report sections into a format exportReportPdf can handle
      const rows = result.sections.flatMap(s => s.rows.map(r => ({
        accountCode: '',
        name: r.label,
        amount: r.amount,
        type: s.heading,
        totalDebit: r.amount >= 0 ? r.amount : 0,
        totalCredit: r.amount < 0 ? Math.abs(r.amount) : 0,
      })))
      const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0)
      const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0)
      await exportReportPdf(
        'trial-balance',
        { rows, grandDebit, grandCredit },
        company,
        { from: startDate, to: endDate }
      )
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  return (
    <div>
      <PageHeader title="Business Reports" description="Generate comprehensive financial reports for your company" />

      <div className="mt-5 rounded-lg border border-border bg-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={(v) => { setReportType(v as ReportType); setResult(null) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-brand-muted-light">{selectedMeta.description}</p>
          </div>
          <div className="space-y-1.5">
            <Label>From Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={generate} disabled={loading} className="bg-primary hover:bg-brand-red-dark text-white">
            {loading ? <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Generating…</> : <><DataBarVerticalRegular className="h-4 w-4 mr-2" />Generate Report</>}
          </Button>
          {result && <Button type="button" variant="outline" onClick={downloadCSV}><ArrowDownloadRegular className="h-4 w-4 mr-2" />Download CSV</Button>}
          {result && <Button type="button" variant="outline" onClick={downloadPdf}><ArrowDownloadRegular className="h-4 w-4 mr-2" />Download PDF</Button>}
        </div>
      </div>

      {result && (
        <div className="mt-5 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">{result.title}</h2>
              <p className="text-xs text-brand-muted-light">Generated {formatDate(new Date(result.generatedAt))}</p>
            </div>
          </div>
          {result.sections.map((section, si) => (
            <div key={si} className="mb-6">
              <h3 className="text-sm font-semibold text-foreground bg-muted/50 px-3 py-2 rounded border border-border mb-1">{section.heading}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {section.rows.map((row, ri) => (
                    <tr key={ri} className={`border-b border-border last:border-border ${row.bold ? 'font-semibold bg-muted/50' : ''}`}>
                      <td className="px-3 py-2 text-foreground">{row.label}</td>
                      <td className={`px-3 py-2 text-right ${row.bold ? 'font-bold text-foreground' : 'text-muted-foreground'} ${row.amount < 0 ? 'text-red-600' : ''}`}>{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
