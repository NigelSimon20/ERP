'use client'

import { useState } from 'react'
import { FaChartBar, FaDownload } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

type ReportType = 'income-statement' | 'balance-sheet' | 'trial-balance' | 'aged-receivables' | 'aged-payables'

const REPORT_TABS: { key: ReportType; label: string }[] = [
  { key: 'income-statement', label: 'Income Statement' },
  { key: 'balance-sheet', label: 'Balance Sheet' },
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

type ReportData = IncomeStatement | BalanceSheet | TrialBalance | AgedReceivables | AgedPayables

function AgingHeader() {
  return (
    <tr>
      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
      <th className="text-right px-3 py-2 font-medium text-gray-600">Current</th>
      <th className="text-right px-3 py-2 font-medium text-gray-600">1–30 days</th>
      <th className="text-right px-3 py-2 font-medium text-gray-600">31–60 days</th>
      <th className="text-right px-3 py-2 font-medium text-gray-600">61–90 days</th>
      <th className="text-right px-3 py-2 font-medium text-gray-600">90+ days</th>
      <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
    </tr>
  )
}

function AgingRow({ name, row }: { name: string; row: AgedRow }) {
  return (
    <tr className="hover:bg-gray-50 border-t border-gray-100">
      <td className="px-3 py-2.5 font-medium text-[#0D1B2A]">{name}</td>
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
      <h3 className="text-sm font-semibold text-[#0D1B2A] uppercase tracking-wide mb-2">{title}</h3>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">{children}</div>
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
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      const tabLabel = REPORT_TABS.find((t) => t.key === activeTab)?.label ?? activeTab
      doc.setFontSize(16)
      doc.text(`Ravenshield ERP — ${tabLabel}`, 14, 20)
      doc.setFontSize(10)
      doc.text(`Generated: ${formatDate(new Date())}`, 14, 28)
      doc.save(`${activeTab}-${to || asAt}.pdf`)
      toast.success('PDF exported')
    } catch {
      toast.error('jsPDF not installed — run: npm install jspdf')
    }
  }

  const isIncome = (d: ReportData): d is IncomeStatement => 'revenueRows' in d
  const isBalance = (d: ReportData): d is BalanceSheet => 'assets' in d && 'balanced' in d
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
      <div className="mt-5 flex gap-1 border-b border-gray-200 overflow-x-auto">
        {REPORT_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setReport(null) }}
            className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.key ? 'border-[#CC0000] text-[#CC0000]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
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
        <Button type="button" onClick={generate} disabled={loading} className="bg-[#CC0000] hover:bg-[#AA0000] text-white h-9">
          {loading ? 'Generating…' : 'Generate Report'}
        </Button>
        {report && (
          <Button type="button" variant="outline" onClick={exportPdf} className="h-9 gap-1.5">
            <FaDownload className="h-3.5 w-3.5" /> Export PDF
          </Button>
        )}
      </div>

      {/* Spinner */}
      {loading && (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty prompt */}
      {!loading && !report && (
        <div className="mt-12 text-center">
          <FaChartBar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Configure the date range above and click Generate Report</p>
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
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Account</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.revenueRows.map((r) => (
                      <tr key={r.accountCode} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.accountCode}</td>
                        <td className="px-3 py-2.5 text-gray-700">{r.name}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-green-600">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-[#0D1B2A]">Total Revenue</td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-600">{formatCurrency(report.totalRevenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
              <Section title="Expenses">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Account</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.expenseRows.map((r) => (
                      <tr key={r.accountCode} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.accountCode}</td>
                        <td className="px-3 py-2.5 text-gray-700">{r.name}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-red-600">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td colSpan={2} className="px-3 py-2.5 font-bold text-[#0D1B2A]">Total Expenses</td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-600">{formatCurrency(report.totalExpenses)}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
              <div className={`rounded-lg border p-4 flex justify-between items-center ${report.netProfit >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <span className="font-bold text-[#0D1B2A] text-base">Net {report.netProfit >= 0 ? 'Profit' : 'Loss'}</span>
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
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Code</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Account</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.accountCode} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.accountCode}</td>
                            <td className="px-3 py-2.5 text-gray-700">{r.name}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(r.balance)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                          <td colSpan={2} className="px-3 py-2.5 font-bold text-[#0D1B2A]">Total {sectionTitle}</td>
                          <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </Section>
                )
              })}
              <div className={`rounded-lg border p-3 flex items-center justify-between text-sm ${report.balanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <span className="font-medium text-[#0D1B2A]">Balance Check: Assets = Liabilities + Equity</span>
                <span className={`font-bold ${report.balanced ? 'text-green-600' : 'text-red-600'}`}>
                  {report.balanced ? '✓ Balanced' : '✗ Out of Balance'}
                </span>
              </div>
            </>
          )}

          {/* Trial Balance */}
          {isTrial(report) && (
            <Section title="Trial Balance">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Code</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Account</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Debit</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.accountCode} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.accountCode}</td>
                      <td className="px-3 py-2.5 text-gray-700">{r.name}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs capitalize">{r.type.toLowerCase()}</td>
                      <td className="px-3 py-2.5 text-right">{r.totalDebit > 0 ? formatCurrency(r.totalDebit) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{r.totalCredit > 0 ? formatCurrency(r.totalCredit) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                    <td colSpan={3} className="px-3 py-2.5 text-[#0D1B2A]">Totals</td>
                    <td className="px-3 py-2.5 text-right text-[#0D1B2A]">{formatCurrency(report.grandDebit)}</td>
                    <td className="px-3 py-2.5 text-right text-[#0D1B2A]">{formatCurrency(report.grandCredit)}</td>
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
                <p className="px-3 py-4 text-sm text-gray-400">No outstanding receivables</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200"><AgingHeader /></thead>
                  <tbody>
                    {(report as AgedReceivables).rows.map((r) => (
                      <AgingRow key={r.customer} name={r.customer} row={r} />
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-[#0D1B2A]">
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
                <p className="px-3 py-4 text-sm text-gray-400">No outstanding payables</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200"><AgingHeader /></thead>
                  <tbody>
                    {(report as AgedPayables).rows.map((r) => (
                      <AgingRow key={r.supplier} name={r.supplier} row={r} />
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-[#0D1B2A]">
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
