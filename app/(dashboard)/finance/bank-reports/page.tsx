'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowDownloadRegular, DataBarVerticalRegular } from '@fluentui/react-icons';

interface AccountSummary { id: string; bankName: string | null; accountNumber: string | null; currency: string | null; isActive: boolean; openingBalance: number; currentBalance: number; totalIn: number; totalOut: number }
interface ReconciliationRow { bankName: string; reconcileDate: string; statementBalance: number; bookBalance: number; difference: number; status: string }
interface MonthlyRow { month: string; totalIn: number; totalOut: number }
interface BankReportResult {
  from: string
  to: string
  accountSummaries: AccountSummary[]
  reconciliationSummary: ReconciliationRow[]
  monthlyCashFlow: MonthlyRow[]
  totals: { totalBalance: number; totalIn: number; totalOut: number }
}

export default function BankReportsPage() {
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(0, 1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BankReportResult | null>(null)

  async function generate() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: startDate, to: endDate })
      const res = await fetch(`/api/finance/reports/bank?${params}`)
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
    const lines: string[] = ['"Bank Reports"', `"Period: ${startDate} to ${endDate}"`, '', '"Account Balances"', '"Bank","Account #","Currency","Opening","Current","In","Out"']
    for (const a of result.accountSummaries) lines.push(`"${a.bankName}","${a.accountNumber}","${a.currency}","${a.openingBalance}","${a.currentBalance}","${a.totalIn}","${a.totalOut}"`)
    lines.push('', '"Reconciliation Status"', '"Bank","Date","Statement Balance","Book Balance","Difference","Status"')
    for (const r of result.reconciliationSummary) lines.push(`"${r.bankName}","${r.reconcileDate}","${r.statementBalance}","${r.bookBalance}","${r.difference}","${r.status}"`)
    lines.push('', '"Monthly Cash Flow"', '"Month","In","Out"')
    for (const m of result.monthlyCashFlow) lines.push(`"${m.month}","${m.totalIn}","${m.totalOut}"`)
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bank-reports.csv'; a.click()
  }

  async function downloadPdf() {
    if (!result) return
    try {
      const { exportReportPdf } = await import('@/lib/pdf')
      let company: any = {}
      try {
        const settingsRes = await fetch('/api/settings')
        if (settingsRes.ok) company = (await settingsRes.json()).company ?? {}
      } catch { /* use defaults */ }
      // Shoehorn into the existing trial-balance PDF shape, same precedent
      // business-reports/department-reports already use — avoids touching
      // lib/pdf.ts for a one-off report type.
      const rows = result.accountSummaries.map(a => ({
        accountCode: a.accountNumber ?? '',
        name: a.bankName ?? '',
        amount: a.currentBalance,
        type: 'Bank Account',
        totalDebit: a.totalIn,
        totalCredit: a.totalOut,
      }))
      const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0)
      const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0)
      await exportReportPdf('trial-balance', { rows, grandDebit, grandCredit }, company, { from: startDate, to: endDate })
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF')
    }
  }

  return (
    <div>
      <PageHeader title="Bank Reports" description="Balance summary, reconciliation status, and cash movement across all bank accounts" />

      <div className="mt-5 rounded-lg border border-border bg-card p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
        <div className="mt-5 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="erp-card !p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Balance (Active)</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatCurrency(result.totals.totalBalance)}</p>
            </div>
            <div className="erp-card !p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total In (Period)</p>
              <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(result.totals.totalIn)}</p>
            </div>
            <div className="erp-card !p-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Total Out (Period)</p>
              <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(result.totals.totalOut)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground bg-muted/50 px-3 py-2 rounded border border-border mb-1">Account Balances</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Bank</th>
                  <th className="text-left px-3 py-2 font-medium">Account #</th>
                  <th className="text-right px-3 py-2 font-medium">Opening</th>
                  <th className="text-right px-3 py-2 font-medium">In</th>
                  <th className="text-right px-3 py-2 font-medium">Out</th>
                  <th className="text-right px-3 py-2 font-medium">Current</th>
                </tr>
              </thead>
              <tbody>
                {result.accountSummaries.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-foreground">{a.bankName}{!a.isActive && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{a.accountNumber}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(a.openingBalance, a.currency ?? 'USD')}</td>
                    <td className="px-3 py-2 text-right text-green-600">{formatCurrency(a.totalIn, a.currency ?? 'USD')}</td>
                    <td className="px-3 py-2 text-right text-red-600">{formatCurrency(a.totalOut, a.currency ?? 'USD')}</td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(a.currentBalance, a.currency ?? 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground bg-muted/50 px-3 py-2 rounded border border-border mb-1">Reconciliation Status</h3>
            {result.reconciliationSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-4">No reconciliations recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Bank</th>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Statement Bal.</th>
                    <th className="text-right px-3 py-2 font-medium">Book Bal.</th>
                    <th className="text-right px-3 py-2 font-medium">Difference</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.reconciliationSummary.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-foreground">{r.bankName}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(new Date(r.reconcileDate))}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(r.statementBalance)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(r.bookBalance)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${Math.abs(r.difference) > 0.01 ? 'text-amber-600' : 'text-green-600'}`}>{formatCurrency(r.difference)}</td>
                      <td className="px-3 py-2 text-foreground">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground bg-muted/50 px-3 py-2 rounded border border-border mb-1">Monthly Cash Flow</h3>
            {result.monthlyCashFlow.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-4">No transactions in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Month</th>
                    <th className="text-right px-3 py-2 font-medium">In</th>
                    <th className="text-right px-3 py-2 font-medium">Out</th>
                    <th className="text-right px-3 py-2 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {result.monthlyCashFlow.map((m, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-foreground">{m.month}</td>
                      <td className="px-3 py-2 text-right text-green-600">{formatCurrency(m.totalIn)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatCurrency(m.totalOut)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(m.totalIn - m.totalOut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
