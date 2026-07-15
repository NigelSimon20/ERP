'use client'

import { useEffect, useState } from 'react'
import { PulseRegular, ReceiptMoneyRegular, MoneyHandRegular, PeopleRegular } from '@fluentui/react-icons'
import { useRealtimeCount } from '@/hooks/useRealtime'
import { useAuth } from '@/hooks/useAuth'
import { KPICard } from '@/components/dashboard/KPICard'

/** Live-updating KPI tiles driven by Supabase Realtime (no polling). */
export function RealtimeKPIDashboard() {
  const { user } = useAuth()
  const companyId = user?.companyId

  const pendingInvoices = useRealtimeCount(
    'sales_invoices',
    companyId,
    (record) => record.status === 'UNPAID' || record.status === 'PARTIAL'
  )

  const pendingPayments = useRealtimeCount(
    'payments',
    companyId,
    (record) => record.status !== 'COMPLETED' && record.status !== 'FAILED'
  )

  const newCustomers = useRealtimeCount(
    'customers',
    companyId,
    (record) => {
      const createdDate = new Date(record.created_date)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      return createdDate > weekAgo
    }
  )

  return (
    <div className="grid grid-cols-1 gap-4 h-full">
      <KPICard title="Pending Invoices" subtitle="Live" value={pendingInvoices} icon={ReceiptMoneyRegular} color="white" />
      <KPICard title="Pending Payments" subtitle="Live" value={pendingPayments} icon={MoneyHandRegular} color="white" />
      <KPICard title="New Customers" subtitle="Last 7 days · Live" value={newCustomers} icon={PeopleRegular} color="white" />
    </div>
  )
}

/** Small pulsing "Live" badge to label real-time sections. */
export function LiveBadge() {
  const [pulse, setPulse] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setPulse(p => !p), 1200)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
      <PulseRegular className={`h-3 w-3 ${pulse ? 'opacity-100' : 'opacity-40'}`} />
      Live
    </span>
  )
}

export default RealtimeKPIDashboard
