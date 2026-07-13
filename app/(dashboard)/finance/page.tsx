'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FaDollarSign, FaChartLine, FaExclamationTriangle, FaBuilding, FaPlus, FaReceipt, FaCreditCard, FaBook, FaUsers, FaChartBar } from 'react-icons/fa'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'

interface FinanceDashboardData {
  totalRevenue: number
  totalExpenses: number
  outstandingReceivables: number
  netProfit: number
  cashInBank: number
  overdueCount: number
  monthlyChart: { month: string; revenue: number; expenses: number }[]
  recentTransactions: { id: string; date: string; type: string; amount: number; entity: string }[]
}

const QUICK_LINKS = [
  { label: 'New Invoice', href: '/finance/sales-invoices', icon: FaPlus, color: 'bg-[#CC0000]' },
  { label: 'Record Receipt', href: '/finance/receipts', icon: FaReceipt, color: 'bg-green-600' },
  { label: 'Record Payment', href: '/finance/payments', icon: FaCreditCard, color: 'bg-[#0D1B2A]' },
  { label: 'New Journal Entry', href: '/finance/journal-entries', icon: FaBook, color: 'bg-purple-600' },
  { label: 'Finance Reports', href: '/finance/finance-reports', icon: FaChartBar, color: 'bg-amber-600' },
  { label: 'Employee Costs', href: '/finance/employees', icon: FaUsers, color: 'bg-teal-600' },
]

function KPICard({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className={`rounded-xl p-4 text-white ${color}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium opacity-80">{label}</p>
        <Icon className="h-5 w-5 opacity-60" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  )
}

function DashboardContent() {
  const { data, isLoading } = useQuery<FinanceDashboardData>({
    queryKey: ['finance-dashboard'],
    queryFn: () => fetch('/api/dashboard/finance').then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-24 bg-gray-200 animate-pulse rounded-xl" />)}
        </div>
      </div>
    )
  }

  const d = data ?? ({} as Partial<FinanceDashboardData>)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard label="Total Revenue (FY)" value={formatCurrency(d.totalRevenue ?? 0)} icon={FaChartLine} color="bg-[#CC0000]" />
        <KPICard label="Outstanding Receivables" value={formatCurrency(d.outstandingReceivables ?? 0)} icon={FaDollarSign} color="bg-[#0D1B2A]" />
        <KPICard label="Total Expenses (FY)" value={formatCurrency(d.totalExpenses ?? 0)} icon={FaChartLine} color="bg-amber-600" />
        <KPICard label="Net Position" value={formatCurrency(d.netProfit ?? 0)} icon={FaChartBar} color={(d.netProfit ?? 0) >= 0 ? 'bg-green-600' : 'bg-red-700'} />
        <KPICard label="Cash in Bank" value={formatCurrency(d.cashInBank ?? 0)} icon={FaBuilding} color="bg-teal-600" />
        <KPICard label="Overdue Invoices" value={String(d.overdueCount ?? 0)} icon={FaExclamationTriangle} color="bg-orange-500" sub="requiring attention" />
      </div>

      {/* Revenue vs Expenses Chart */}
      {(d.monthlyChart ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0D1B2A] mb-4">Revenue vs Expenses (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.monthlyChart} barGap={4}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => {
                const v = Array.isArray(value) ? value[0] : value
                return formatCurrency(Number(v ?? 0))
              }} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill="#CC0000" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#0D1B2A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Links */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0D1B2A] mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50 transition-colors group">
                <div className={`h-7 w-7 rounded-md ${link.color} flex items-center justify-center flex-shrink-0`}>
                  <link.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-xs font-medium text-gray-700 group-hover:text-[#CC0000]">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0D1B2A] mb-3">Recent Transactions</h3>
          {(d.recentTransactions ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No recent transactions</p>
          ) : (
            <div className="space-y-2">
              {(d.recentTransactions ?? []).slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-xs font-medium text-[#0D1B2A]">{t.entity}</p>
                    <p className="text-xs text-gray-400">{t.type} · {formatDate(new Date(t.date))}</p>
                  </div>
                  <span className={`text-xs font-semibold ${t.type === 'Receipt' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'Receipt' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FinanceDashboardPage() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }))
  return (
    <QueryClientProvider client={queryClient}>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0D1B2A]">Finance Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Financial overview for your company</p>
        </div>
        <DashboardContent />
      </div>
    </QueryClientProvider>
  )
}
