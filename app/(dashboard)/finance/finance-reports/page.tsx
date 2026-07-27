'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowDownloadRegular, DataBarVerticalRegular } from '@fluentui/react-icons';

type ReportType = 'income-statement' | 'balance-sheet' | 'cash-flow' | 'general-ledger' | 'trial-balance' | 'aged-receivables' | 'aged-payables'

const REPORT_TABS: { key: ReportType; label: string }[] = [
  { key: 'income-statement', label: 'Income Statement' },
  { key: 'balance-sheet', label: 'Balance Sheet' },
  { key: 'cash-flow', label: 'Cash Flow' },
  { key: 'general-ledger', label: 'General Ledger' },
  { key: 'trial-balance', label: 'Trial Balance' },
  { key: 'aged-receivables', label: 'Aged Receivables' },
  { key: 'aged-payables', label: 'Aged Payables' },
]

interface IncomeStatement {
  revenueRows: { accountCode: string; name: string; amount: number }[]
  expenseRows: { accountCode: string; name: string; amount: number }[]
  totalRevenue: number
  totalExpenses: number
  netProfit: number
}

interface BalanceSheet {
  rows: { accountCode: string; name: string; type: string; balance: number }[]
  assets: number
  liabilities: number
  equity: number
  balanced: boolean
}

interface TrialBalance {
  rows: { accountCode: string; name: string; type: string; totalDebit: number; totalCredit: number }[]
  grandDebit: number
  grandCredit: number
}

interface AgedRow { current: number; days1_30: number; days31_60: number; days61_90: number; days90plus: number; total: number }
interface AgedReceivables { rows: ({ customer: string } & AgedRow)[]; totals: AgedRow }
interface AgedPayables { rows: ({ supplier: string } & AgedRow)[]; totals: AgedRow }

interface CashFlowSection { lines: { label: string; amount: number }[]; total: number }
interface CashFlow { operating: CashFlowSection; investing: CashFlowSection; financing: CashFlowSection; netChange: number; openingCash: number; closingCash: number }

interface GeneralLedgerLine { date: string; reference: string; description: string; debit: number; credit: number; runningBalance: number }
interface GeneralLedgerAccount { accountId: string; accountCode: string | null; accountName: string | null; openingBalance: number; closingBalance: number; lines: GeneralLedgerLine[] }
interface GeneralLedger { accounts: GeneralLedgerAccount[] }

type ReportData = IncomeStatement | BalanceSheet | TrialBalance | AgedReceivables | AgedPayables | CashFlow | GeneralLedger

function AgingHeader() {
  return (
    <tr>
      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Current</th>
      <th className="text-right px-3 py-2 font-medium text-muted-foreground">1–30 days</th>
      <th className="text-right px-3 py-2 font-medium text-muted-foreground">31–60 days</th>
      <th className="text-right px-3 py-2 font-medium text-muted-foreground">61–90 days</th>
      <th className="text-right px-3 py-2 font-medium text-muted-foreground">90+ days</th>
      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
    </tr>
  )
}

function AgingRow({ name, row }: { name: string; row: AgedRow }) {
  return (
    <tr className="hover:bg-muted/50 border-t border-border">
      <td className="px-3 py-2.5 font-medium text-foreground">{name}</td>
      <td className="px-3 py-2.5 text-right">{formatCurrency(row.current)}</td>
      <td className="px-3 py-2.5 text-right">{formatCurrency(row.days1_30)}</td>
      <td className="px-3 py-2.5 text-right">{formatCurrency(row.days31_60)}</td>
      <td className="px-3 py-2.5 text-right">{formatCurrency(row.days61_90)}</td>
      <td className="px-3 py-2.5 text-right text-red-600 font-medium">{formatCurrency(row.days90plus)}</td>
      <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(row.total)}</td>
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">{title}</h3>
      <div className="rounded-lg border border-border bg-card overflow-hidden">{children}</div>
    </div>
  )
}

export default function FinanceReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>('income-statement')
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(0, 1); return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
  const [asAt, setAsAt] = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<ReportData | null>(null)

  const needsRange = activeTab !== 'balance-sheet' && activeTab !== 'aged-receivables' && activeTab !== 'aged-payables'
  const needsAsAt = activeTab === 'balance-sheet'

  async function generate() {
    setLoading(true)
    setReport(null)
    try {
      const params = new URLSearchParams({ type: activeTab })
      if (needsRange) { params.set('from', from); params.set('to', to) }
      if (needsAsAt) params.set('asAt', asAt)
      const res = await fetch(`/api/finance/reports?${params}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load report'); setReport(null); return }
      setReport(json)
    } catch {
      toast.error('Network error loading report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  async function exportPdf() {
    if (!report) return
    try {
      const { exportReportPdf } = await import('@/lib/pdf')
      // Fetch company settings for PDF branding
      let company: any = {}
      try {
        const settingsRes = await fetch('/api/settings')
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json()
          company = settingsJson.company ?? {}
        }
      } catch { /* use defaults */ }
      await exportReportPdf(
        activeTab,
        report,
        company,
        { from: needsRange ? from : undefined, to: needsRange ? to : undefined, asAt: needsAsAt ? asAt : undefined }
      )
      toast.success('PDF exported')
    } catch {
      toast.error('Failed to export PDF — ensure jspdf is installed')
    }
  }

  const isIncome = (d: ReportData): d is IncomeStatement => 'revenueRows' in d
  const isBalance = (d: ReportData): d is BalanceSheet => 'assets' in d && 'balanced' in d
  const isCashFlow = (d: ReportData): d is CashFlow => 'operating' in d && 'netChange' in d
  const isGeneralLedger = (d: ReportData): d is GeneralLedger => 'accounts' in d
  const isTrial = (d: ReportData): d is TrialBalance => 'grandDebit' in d
  const isReceivables = (): boolean => activeTab === 'aged-receivables'
  const isPayables = (): boolean => activeTab === 'aged-payables'

  return (
    <div>
      <PageHeader
        title="Financial Reports"
        description="Generate income statements, balance sheets, and aging reports"
      />

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-border overflow-x-auto">
        {REPORT_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setReport(null) }}
            className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        {needsRange && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-9 text-sm" />
            </div>
          </>
        )}
        {needsAsAt && (
          <div className="space-y-1.5">
            <Label className="text-xs">As at</Label>
            <Input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} className="w-36 h-9 text-sm" />
          </div>
        )}
        <Button type="button" onClick={generate} disabled={loading} className="bg-primary hover:bg-brand-red-dark text-white h-9">
          {loading ? 'Generating…' : 'Generate Report'}
        </Button>
        {report && (
          <Button type="button" variant="outline" onClick={exportPdf} className="h-9 gap-1.5">
            <ArrowDownloadRegular className="h-3.5 w-3.5" /> Export PDF
          </Button>
        )}
      </div>

      {/* Spinner */}
      {loading && (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty prompt */}
      {!loading && !report && (
        <div className="mt-12 text-center">
          <DataBarVerticalRegular className="h-10 w-10 text-brand-muted-light mx-auto mb-3" />
          <p className="text-sm text-brand-muted-light">Configure the date range above and click Generate Report</p>
        </div>
      )}

      {/* Report output */}
      {!loading && report && (
        <div className="mt-6 space-y-6">

          {/* Income Statement */}
          {isIncome(report) && (
            <>
              <Section title="Revenue">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.revenueRows.map((r) => (
                      <tr key={r.accountCode} className="border-t border-border hover:bg-muted/50">
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.accountCode}</td>
                        <td className="px-3 py-2.5 text-foreground">{r.name}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-green-600">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-foreground">Total Revenue</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-600">{formatCurrency(report.totalRevenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
              <Section title="Expenses">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.expenseRows.map((r) => (
                      <tr key={r.accountCode} className="border-t border-border hover:bg-muted/50">
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.accountCode}</td>
                        <td className="px-3 py-2.5 text-foreground">{r.name}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-red-600">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-foreground">Total Expenses</td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-600">{formatCurrency(report.totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
              <div className={`rounded-lg border p-4 flex justify-between items-center ${report.netProfit >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <span className="font-bold text-foreground text-base">Net {report.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
                <span className={`text-xl font-bold ${report.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(Math.abs(report.netProfit))}
                </span>
              </div>
            </>
          )}

          {/* Balance Sheet */}
          {isBalance(report) && (
            <>
              {(['ASSET', 'LIABILITY', 'EQUITY'] as const).map((t) => {
                const rows = report.rows.filter((r) => r.type === t)
                const total = rows.reduce((s, r) => s + r.balance, 0)
                const sectionTitle = t === 'ASSET' ? 'Assets' : t === 'LIABILITY' ? 'Liabilities' : 'Equity'
                return (
                  <Section key={t} title={sectionTitle}>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Code</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.accountCode} className="border-t border-border hover:bg-muted/50">
                            <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.accountCode}</td>
                            <td className="px-3 py-2.5 text-foreground">{r.name}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(r.balance)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/50">
                          <td colSpan={2} className="px-3 py-2.5 font-bold text-foreground">Total {sectionTitle}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                )
              })}
              <div className={`rounded-lg border p-3 flex items-center justify-between text-sm ${report.balanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <span className="font-medium text-foreground">Balance Check: Assets = Liabilities + Equity</span>
                <span className={`font-bold ${report.balanced ? 'text-green-600' : 'text-red-600'}`}>
                  {report.balanced ? '✓ Balanced' : '✗ Out of Balance'}
                </span>
              </div>
            </>
          )}

          {/* Cash Flow */}
          {isCashFlow(report) && (
            <>
              {([['operating', 'Cash Flow from Operating Activities'], ['investing', 'Cash Flow from Investing Activities'], ['financing', 'Cash Flow from Financing Activities']] as const).map(([key, title]) => {
                const section = report[key]
                return (
                  <Section key={key} title={title}>
                    <table className="w-full text-sm">
                      <tbody>
                        {section.lines.map((l, i) => (
                          <tr key={i} className="border-t border-border hover:bg-muted/50">
                            <td className="px-3 py-2.5 text-foreground">{l.label}</td>
                            <td className={`px-3 py-2.5 text-right font-medium ${l.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(l.amount)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/50">
                          <td className="px-3 py-2.5 font-bold text-foreground">Net {title.replace('Cash Flow from ', '')}</td>
                          <td className={`px-3 py-2.5 text-right font-bold ${section.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(section.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                )
              })}
              <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Opening Cash</span><span className="font-medium">{formatCurrency(report.openingCash)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Net Change in Cash</span><span className={`font-medium ${report.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(report.netChange)}</span></div>
                <div className="flex justify-between border-t border-border pt-1.5"><span className="font-bold text-foreground">Closing Cash</span><span className="font-bold text-foreground">{formatCurrency(report.closingCash)}</span></div>
              </div>
            </>
          )}

          {/* General Ledger */}
          {isGeneralLedger(report) && (
            report.accounts.length === 0 ? (
              <p className="text-sm text-brand-muted-light text-center py-8">No posted activity for this period</p>
            ) : (
              <>
                {report.accounts.map((acc) => (
                  <Section key={acc.accountId} title={`${acc.accountCode ?? ''} — ${acc.accountName ?? ''}`}>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reference</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Debit</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Credit</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={5} className="px-3 py-2 text-muted-foreground italic">Opening Balance</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(acc.openingBalance)}</td>
                        </tr>
                        {acc.lines.map((l, i) => (
                          <tr key={i} className="border-t border-border hover:bg-muted/50">
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{formatDate(l.date)}</td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs">{l.reference}</td>
                            <td className="px-3 py-2.5 text-foreground">{l.description}</td>
                            <td className="px-3 py-2.5 text-right">{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                            <td className="px-3 py-2.5 text-right">{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(l.runningBalance)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/50">
                          <td colSpan={5} className="px-3 py-2.5 font-bold text-foreground">Closing Balance</td>
                          <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(acc.closingBalance)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                ))}
              </>
            )
          )}

          {/* Trial Balance */}
          {isTrial(report) && (
            <Section title="Trial Balance">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Code</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Debit</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.accountCode} className="border-t border-border hover:bg-muted/50">
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.accountCode}</td>
                      <td className="px-3 py-2.5 text-foreground">{r.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs capitalize">{r.type.toLowerCase()}</td>
                      <td className="px-3 py-2.5 text-right">{r.totalDebit > 0 ? formatCurrency(r.totalDebit) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{r.totalCredit > 0 ? formatCurrency(r.totalCredit) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/50 font-bold">
                    <td colSpan={3} className="px-3 py-2.5 text-foreground">Totals</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{formatCurrency(report.grandDebit)}</td>
                    <td className="px-3 py-2.5 text-right text-foreground">{formatCurrency(report.grandCredit)}</td>
                  </tr>
                </tbody>
              </table>
              <p className={`text-xs font-medium mt-2 px-3 pb-2 ${Math.abs(report.grandDebit - report.grandCredit) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                {Math.abs(report.grandDebit - report.grandCredit) < 0.01
                  ? '✓ Trial balance agrees'
                  : `✗ Difference: ${formatCurrency(Math.abs(report.grandDebit - report.grandCredit))}`}
              </p>
            </Section>
          )}

          {/* Aged Receivables */}
          {isReceivables() && 'rows' in report && (
            <Section title="Aged Receivables">
              {(report as AgedReceivables).rows.length === 0 ? (
                <p className="px-3 py-4 text-sm text-brand-muted-light">No outstanding receivables</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border"><AgingHeader /></thead>
                  <tbody>
                    {(report as AgedReceivables).rows.map((r) => (
                      <AgingRow key={r.customer} name={r.customer} row={r} />
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold text-foreground">
                      <td className="px-3 py-2.5">Total</td>
                      {(['current', 'days1_30', 'days31_60', 'days61_90', 'days90plus', 'total'] as const).map((k) => (
                        <td key={k} className="px-3 py-2.5 text-right">{formatCurrency((report as AgedReceivables).totals[k])}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </Section>
          )}

          {/* Aged Payables */}
          {isPayables() && 'rows' in report && (
            <Section title="Aged Payables">
              {(report as AgedPayables).rows.length === 0 ? (
                <p className="px-3 py-4 text-sm text-brand-muted-light">No outstanding payables</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border"><AgingHeader /></thead>
                  <tbody>
                    {(report as AgedPayables).rows.map((r) => (
                      <AgingRow key={r.supplier} name={r.supplier} row={r} />
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold text-foreground">
                      <td className="px-3 py-2.5">Total</td>
                      {(['current', 'days1_30', 'days31_60', 'days61_90', 'days90plus', 'total'] as const).map((k) => (
                        <td key={k} className="px-3 py-2.5 text-right">{formatCurrency((report as AgedPayables).totals[k])}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              )}
            </Section>
          )}

        </div>
      )}
    </div>
  )
}
