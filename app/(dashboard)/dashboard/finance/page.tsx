'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'
import { ArrowDownloadRegular, ArrowTrendingRegular, ArrowUploadRegular, BuildingBankRegular, DataBarVerticalRegular, MoneyHandRegular, PaymentRegular, ReceiptMoneyRegular, ShieldErrorRegular, VehicleTruckRegular } from '@fluentui/react-icons';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { RealtimeKPIDashboard } from '@/components/realtime/kpi-dashboard'
import { RealtimeLiveActivityFeed } from '@/components/realtime/live-activity-feed'

const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
import Link from 'next/link'

interface FinanceData {
  reportingCurrency: string
  viewCurrency: string
  availableCurrencies: string[]
  excludedCount: number
  totalRevenue: number
  totalCollected: number
  outstandingReceivables: number
  exchangeRateStale?: boolean
  latestRateDate?: string | null
  totalExpenses: number
  netProfit: number
  cashCollected: number
  cashPaidOut: number
  cashInBank: number
  pettyCash: number
  totalBankAccounts: number
  balanceSheetSummary: {
    totalAssets: number
    currentAssets: number
    nonCurrentAssets: number
    unclassifiedAssets: number
    totalLiabilities: number
    currentLiabilities: number
    nonCurrentLiabilities: number
    unclassifiedLiabilities: number
    totalEquity: number
    balanced: boolean
  }
  ratios: {
    workingCapital: number
    currentRatio: number | null
    quickRatio: number | null
    debtToEquity: number | null
  }
  trialBalanceSummary: { grandDebit: number; grandCredit: number; balanced: boolean }
  overdueCount: number
  overdueAmount: number
  unpaidSuppliers: number
  lowInventoryCount: number
  lastPayroll: { totalNet: number; period: string } | null
  monthlyChart: { month: string; revenue: number; expenses: number }[]
  bankBalances: { bankName: string; accountNumber: string; balance: number; currency: string }[]
  topDebtors: { name: string; outstandingBal: number; daysOverdue: number; lastPayment: string | null }[]
  invoicesDueSoon: { invoiceNumber: string; customerName: string; dueDate: string; balanceDue: number }[]
  recentTransactions: { date: string; type: string; reference: string; amount: number; entity: string }[]
}
const DASHBOARD_REFRESH_MS = 30_000

function fmtY(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function fmtRatio(v: number | null) {
  return v === null ? 'N/A' : v.toFixed(2)
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [currency, setCurrency] = useState<string | null>(null) // null = reporting currency (default)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async (initial = false) => {
      if (initial && mounted) {
        setLoading(true)
        setError(false)
      }

      try {
        const url = currency ? `/api/dashboard/finance?currency=${encodeURIComponent(currency)}` : '/api/dashboard/finance'
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const json = await res.json()

        if (!mounted) return
        setData(json)
        setError(false)
      } catch {
        if (mounted && initial) setError(true)
      } finally {
        if (mounted && initial) setLoading(false)
      }
    }

    void loadDashboard(true)
    const refreshId = setInterval(() => {
      void loadDashboard(false)
    }, DASHBOARD_REFRESH_MS)

    return () => {
      mounted = false
      clearInterval(refreshId)
    }
  }, [currency])

  if (error) return (
    <DashboardPageShell title="Finance Dashboard" subtitle="Financial overview">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load dashboard data.</p>
    </DashboardPageShell>
  )

  const now = new Date()
  const threeDaysOut = new Date(now.getTime() + 3 * 86_400_000)
  const vc = data?.viewCurrency || 'USD'
  const isNativeView = !!data && data.viewCurrency !== data.reportingCurrency

  return (
    <DashboardPageShell title="Finance Dashboard" subtitle="Revenue, expenses & receivables">
      <div className="space-y-6">
        {/* A5: converted figures use the newest rate; say so when it's old. */}
        {data?.exchangeRateStale && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
            Exchange rates are out of date{data.latestRateDate ? ` (latest ${new Date(data.latestRateDate).toLocaleDateString()})` : ' (none entered yet)'}. Figures in other currencies may be converted at an old rate. <a href="/finance/exchange-rates" className="underline">Update rates</a>
          </div>
        )}
        {/* Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'New Invoice', href: '/finance/sales-invoices', Icon: ReceiptMoneyRegular },
              { label: 'Record Receipt', href: '/finance/receipts', Icon: MoneyHandRegular },
              { label: 'Run Payroll', href: '/finance/payroll', Icon: PaymentRegular },
              { label: 'Finance Reports', href: '/finance/finance-reports', Icon: ReceiptMoneyRegular },
            ].map(({ label, href, Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-1.5 px-3 py-1.5 erp-btn erp-btn-ghost erp-btn-sm">
                <Icon fontSize={13} /> {label}
              </Link>
            ))}
          </div>
          {data && data.availableCurrencies.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              {data.availableCurrencies.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c === data.reportingCurrency ? null : c)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${vc === c ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  {c}{c === data.reportingCurrency ? ' (Reporting)' : ' (Native)'}
                </button>
              ))}
            </div>
          )}
        </div>

        {isNativeView && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            Showing <strong>{vc}</strong>-denominated transactions only, at face value with no currency conversion. Figures below will not match the {data!.reportingCurrency} view — switch back to compare against the consolidated books.
          </div>
        )}
        {!isNativeView && (data?.excludedCount ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            {data!.excludedCount} transaction{data!.excludedCount === 1 ? '' : 's'} in a currency with no exchange rate on file were excluded from these {data!.reportingCurrency} totals rather than added unconverted. Use the currency toggle above to view them at face value.
          </div>
        )}

        {/* Row 1 — Revenue */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? [1,2,3].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Revenue" subtitle="Ledger, fiscal year to date" value={formatCurrency(data!.totalRevenue, vc)} icon={ArrowTrendingRegular} color="red" />
            <KPICard title="Cash Collected" subtitle="Customer receipts, fiscal year to date" value={formatCurrency(data!.cashCollected, vc)} icon={MoneyHandRegular} color="navy" />
            <KPICard title="Net Profit" subtitle="Revenue − expenses (ledger)" value={formatCurrency(data!.netProfit, vc)} icon={ArrowTrendingRegular} color={data!.netProfit >= 0 ? 'green' : 'red'} />
          </>}
        </div>

        {/* Row 2 — Receivables/Payables */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Outstanding" value={formatCurrency(data!.outstandingReceivables, vc)} icon={ReceiptMoneyRegular} color="white" />
            <KPICard title="Overdue Invoices" subtitle={formatCurrency(data!.overdueAmount, vc)} value={data!.overdueCount} icon={ShieldErrorRegular} color={data!.overdueCount > 0 ? 'amber' : 'white'} />
            <KPICard title="Unpaid Bills" value={formatCurrency(data!.unpaidSuppliers, vc)} icon={VehicleTruckRegular} color="white" />
            <KPICard title="Cash in Bank" value={formatCurrency(data!.cashInBank, vc)} icon={BuildingBankRegular} color="white" />
          </>}
        </div>

        {/* Row 2.4 — Cash position */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Total Bank Accounts" value={data!.totalBankAccounts} icon={BuildingBankRegular} color="navy" />
            <KPICard title="Cash In" subtitle="Fiscal year to date" value={formatCurrency(data!.cashCollected, vc)} icon={ArrowDownloadRegular} color="green" />
            <KPICard title="Cash Out" subtitle="Fiscal year to date" value={formatCurrency(data!.cashPaidOut, vc)} icon={ArrowUploadRegular} color="amber" />
            <KPICard title="Petty Cash" subtitle="Included in Cash in Bank" value={formatCurrency(data!.pettyCash, vc)} icon={MoneyHandRegular} color="white" />
          </>}
        </div>

        {/* Row 2.45 — Balance Sheet summary (GL basis) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Total Assets" value={formatCurrency(data!.balanceSheetSummary.totalAssets, vc)} icon={DataBarVerticalRegular} color="navy" />
            <KPICard title="Current Assets" value={formatCurrency(data!.balanceSheetSummary.currentAssets, vc)} icon={ReceiptMoneyRegular} color="blue" />
            <KPICard title="Current Liabilities" value={formatCurrency(data!.balanceSheetSummary.currentLiabilities, vc)} icon={ShieldErrorRegular} color="amber" />
            <KPICard title="Total Equity" value={formatCurrency(data!.balanceSheetSummary.totalEquity, vc)} icon={PaymentRegular} color="green" />
          </>}
        </div>

        {/* Row 2.46 — Financial ratios (GL basis — ties to Balance Sheet, not the cash-basis KPIs above) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Working Capital" subtitle="GL basis" value={formatCurrency(data!.ratios.workingCapital, vc)} icon={ArrowTrendingRegular} color={data!.ratios.workingCapital >= 0 ? 'green' : 'red'} />
            <KPICard title="Current Ratio" subtitle="GL basis" value={fmtRatio(data!.ratios.currentRatio)} icon={DataBarVerticalRegular} color={(data!.ratios.currentRatio ?? 0) < 1 ? 'amber' : 'green'} />
            <KPICard title="Quick Ratio" subtitle="GL basis" value={fmtRatio(data!.ratios.quickRatio)} icon={MoneyHandRegular} color={(data!.ratios.quickRatio ?? 0) < 1 ? 'amber' : 'green'} />
            <KPICard title="Debt-to-Equity" subtitle="GL basis" value={fmtRatio(data!.ratios.debtToEquity)} icon={PaymentRegular} color="white" />
          </>}
        </div>

        {!loading && (
          <Link href="/finance/finance-reports" className="block rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
            Trial Balance: Debit {formatCurrency(data!.trialBalanceSummary.grandDebit, vc)} · Credit {formatCurrency(data!.trialBalanceSummary.grandCredit, vc)} ·{' '}
            <span className={data!.trialBalanceSummary.balanced ? 'text-green-600 dark:text-green-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
              {data!.trialBalanceSummary.balanced ? 'Balanced ✓' : 'Out of balance'}
            </span>
            {' '}— view full report →
          </Link>
        )}

        {/* Row 2.5 — Live activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <RealtimeKPIDashboard />
          </div>
          <div className="lg:col-span-2">
            <RealtimeLiveActivityFeed />
          </div>
        </div>

        {/* Row 3 — Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Revenue vs Expenses — Last 6 Months</h3>
            {loading ? <div className="h-52 bg-border rounded-xl animate-pulse" /> :
              !data?.monthlyChart.some(m => m.revenue > 0 || m.expenses > 0) ?
              <EmptyState icon={DataBarVerticalRegular} title="No data yet" description="Transactions will appear here" /> :
              <ResponsiveContainer width="100%" height={208}>
                <LineChart data={data!.monthlyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0), vc)} contentStyle={CT} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#DC2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#111827" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            }
          </div>

          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-4">Bank Balances</h3>
            {loading ? <div className="h-52 bg-border rounded-xl animate-pulse" /> :
              !data?.bankBalances.length ?
              <EmptyState icon={BuildingBankRegular} title="No bank accounts" description="Add bank accounts in Finance settings" /> :
              <ResponsiveContainer width="100%" height={208}>
                <BarChart data={data!.bankBalances} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="bankName" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0), vc)} contentStyle={CT} />
                  <Bar dataKey="balance" name="Balance" fill="#DC2626" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Row 4 — Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Top Debtors</h3>
            {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
              !data?.topDebtors.filter(d => d.outstandingBal > 0).length ?
              <p className="text-sm text-brand-muted-light text-center py-6">All customers are current</p> :
              <table className="w-full text-xs">
                <thead><tr className="text-brand-muted-light border-b border-border">
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-right pb-2 font-medium">Outstanding</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.topDebtors.filter(d => d.outstandingBal > 0).map(d => (
                    <tr key={d.name}>
                      <td className="py-2 text-foreground truncate max-w-[160px]">{d.name}</td>
                      <td className="py-2 text-right font-medium text-red-600">{formatCurrency(d.outstandingBal, vc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>

          <div className="bg-card erp-card">
            <h3 className="text-sm font-semibold text-foreground mb-3">Due in 7 Days</h3>
            {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
              !data?.invoicesDueSoon.length ?
              <p className="text-sm text-brand-muted-light text-center py-6">No invoices due soon</p> :
              <table className="w-full text-xs">
                <thead><tr className="text-brand-muted-light border-b border-border">
                  <th className="text-left pb-2 font-medium">Invoice</th>
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-right pb-2 font-medium">Balance</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.invoicesDueSoon.map(inv => {
                    const urgent = new Date(inv.dueDate) <= threeDaysOut
                    return (
                      <tr key={inv.invoiceNumber} className={urgent ? 'bg-red-50' : ''}>
                        <td className="py-2 font-mono text-muted-foreground">{inv.invoiceNumber}</td>
                        <td className="py-2 text-foreground truncate max-w-[100px]">{inv.customerName}</td>
                        <td className={`py-2 text-right font-medium ${urgent ? 'text-red-600' : 'text-foreground'}`}>{formatCurrency(inv.balanceDue, vc)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            }
          </div>
        </div>

        {/* Row 5 — Recent Transactions */}
        <div className="bg-card erp-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Recent Transactions</h3>
          {loading ? <div className="h-32 bg-border rounded-xl animate-pulse" /> :
            !data?.recentTransactions.length ?
            <p className="text-sm text-brand-muted-light text-center py-6">No transactions recorded</p> :
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-brand-muted-light border-b border-border">
                  {['Date', 'Type', 'Reference', 'Amount'].map(h => <th key={h} className={`pb-2 font-medium ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.recentTransactions.map((t, i) => (
                    <tr key={i}>
                      <td className="py-2 text-muted-foreground">{formatDate(t.date)}</td>
                      <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${t.type === 'Receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span></td>
                      <td className="py-2 font-mono text-muted-foreground">{t.reference}</td>
                      <td className={`py-2 text-right font-medium ${t.type === 'Receipt' ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(t.amount, vc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    </DashboardPageShell>
  )
}




