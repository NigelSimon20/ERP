'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'
import { MdTrendingUp } from 'react-icons/md'
import { FaHandHoldingUsd, FaChartLine, FaFileInvoiceDollar, FaTruck, FaMoneyCheckAlt, FaChartBar } from 'react-icons/fa'
import { TbBuildingBank, TbShieldExclamation, TbReportMoney } from 'react-icons/tb'
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell'
import { KPICard } from '@/components/dashboard/KPICard'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'

const CT = { fontSize: 12, borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }
import Link from 'next/link'

interface FinanceData {
  totalRevenue: number
  totalCollected: number
  outstandingReceivables: number
  totalExpenses: number
  netProfit: number
  cashInBank: number
  overdueCount: number
  overdueAmount: number
  unpaidSuppliers: number
  lowInventoryCount: number
  lastPayroll: { totalNet: number; period: string } | null
  monthlyChart: { month: string; revenue: number; expenses: number }[]
  bankBalances: { bankName: string; accountNumber: string; balance: number }[]
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

export default function FinanceDashboardPage() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async (initial = false) => {
      if (initial && mounted) {
        setLoading(true)
        setError(false)
      }

      try {
        const res = await fetch('/api/dashboard/finance', { cache: 'no-store' })
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
  }, [])

  if (error) return (
    <DashboardPageShell title="Finance Dashboard" subtitle="Financial overview">
      <p className="text-sm text-red-500 py-12 text-center">Failed to load dashboard data.</p>
    </DashboardPageShell>
  )

  const now = new Date()
  const threeDaysOut = new Date(now.getTime() + 3 * 86_400_000)

  return (
    <DashboardPageShell title="Finance Dashboard" subtitle="Revenue, expenses & receivables">
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'New Invoice', href: '/finance/sales-invoices', Icon: FaFileInvoiceDollar },
            { label: 'Record Receipt', href: '/finance/receipts', Icon: FaHandHoldingUsd },
            { label: 'Run Payroll', href: '/finance/payroll', Icon: FaMoneyCheckAlt },
            { label: 'Finance Reports', href: '/finance/finance-reports', Icon: TbReportMoney },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5 px-3 py-1.5 erp-btn erp-btn-ghost erp-btn-sm">
              <Icon size={13} /> {label}
            </Link>
          ))}
        </div>

        {/* Row 1 — Revenue */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? [1,2,3].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Total Revenue" subtitle="Fiscal year" value={formatCurrency(data!.totalRevenue)} icon={MdTrendingUp} color="red" />
            <KPICard title="Total Collected" value={formatCurrency(data!.totalCollected)} icon={FaHandHoldingUsd} color="navy" />
            <KPICard title="Net Profit" value={formatCurrency(data!.netProfit)} icon={FaChartLine} color={data!.netProfit >= 0 ? 'green' : 'red'} />
          </>}
        </div>

        {/* Row 2 — Receivables/Payables */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {loading ? [1,2,3,4].map(i => <div key={i} className="erp-card !p-5 animate-pulse h-28" />) : <>
            <KPICard title="Outstanding" value={formatCurrency(data!.outstandingReceivables)} icon={FaFileInvoiceDollar} color="white" />
            <KPICard title="Overdue Invoices" subtitle={formatCurrency(data!.overdueAmount)} value={data!.overdueCount} icon={TbShieldExclamation} color={data!.overdueCount > 0 ? 'amber' : 'white'} />
            <KPICard title="Unpaid Bills" value={formatCurrency(data!.unpaidSuppliers)} icon={FaTruck} color="white" />
            <KPICard title="Cash in Bank" value={formatCurrency(data!.cashInBank)} icon={TbBuildingBank} color="white" />
          </>}
        </div>

        {/* Row 3 — Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-4">Revenue vs Expenses — Last 6 Months</h3>
            {loading ? <div className="h-52 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.monthlyChart.some(m => m.revenue > 0 || m.expenses > 0) ?
              <EmptyState icon={FaChartBar} title="No data yet" description="Transactions will appear here" /> :
              <ResponsiveContainer width="100%" height={208}>
                <LineChart data={data!.monthlyChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0))} contentStyle={CT} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#E74C5B" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#0D1B2A" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            }
          </div>

          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-4">Bank Balances</h3>
            {loading ? <div className="h-52 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.bankBalances.length ?
              <EmptyState icon={TbBuildingBank} title="No bank accounts" description="Add bank accounts in Finance settings" /> :
              <ResponsiveContainer width="100%" height={208}>
                <BarChart data={data!.bankBalances} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="bankName" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value ?? 0))} contentStyle={CT} />
                  <Bar dataKey="balance" name="Balance" fill="#E74C5B" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            }
          </div>
        </div>

        {/* Row 4 — Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Top Debtors</h3>
            {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.topDebtors.filter(d => d.outstandingBal > 0).length ?
              <p className="text-sm text-gray-400 text-center py-6">All customers are current</p> :
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-right pb-2 font-medium">Outstanding</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.topDebtors.filter(d => d.outstandingBal > 0).map(d => (
                    <tr key={d.name}>
                      <td className="py-2 text-gray-800 truncate max-w-[160px]">{d.name}</td>
                      <td className="py-2 text-right font-medium text-red-600">{formatCurrency(d.outstandingBal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>

          <div className="bg-white erp-card">
            <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Due in 7 Days</h3>
            {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
              !data?.invoicesDueSoon.length ?
              <p className="text-sm text-gray-400 text-center py-6">No invoices due soon</p> :
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Invoice</th>
                  <th className="text-left pb-2 font-medium">Customer</th>
                  <th className="text-right pb-2 font-medium">Balance</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.invoicesDueSoon.map(inv => {
                    const urgent = new Date(inv.dueDate) <= threeDaysOut
                    return (
                      <tr key={inv.invoiceNumber} className={urgent ? 'bg-red-50' : ''}>
                        <td className="py-2 font-mono text-gray-600">{inv.invoiceNumber}</td>
                        <td className="py-2 text-gray-800 truncate max-w-[100px]">{inv.customerName}</td>
                        <td className={`py-2 text-right font-medium ${urgent ? 'text-red-600' : 'text-gray-800'}`}>{formatCurrency(inv.balanceDue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            }
          </div>
        </div>

        {/* Row 5 — Recent Transactions */}
        <div className="bg-white erp-card">
          <h3 className="text-sm font-semibold text-[#1F2937] mb-3">Recent Transactions</h3>
          {loading ? <div className="h-32 bg-[#F3F4F6] rounded-xl animate-pulse" /> :
            !data?.recentTransactions.length ?
            <p className="text-sm text-gray-400 text-center py-6">No transactions recorded</p> :
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 border-b border-gray-100">
                  {['Date', 'Type', 'Reference', 'Amount'].map(h => <th key={h} className={`pb-2 font-medium ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data!.recentTransactions.map((t, i) => (
                    <tr key={i}>
                      <td className="py-2 text-gray-500">{formatDate(t.date)}</td>
                      <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${t.type === 'Receipt' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.type}</span></td>
                      <td className="py-2 font-mono text-gray-600">{t.reference}</td>
                      <td className={`py-2 text-right font-medium ${t.type === 'Receipt' ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(t.amount)}</td>
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




