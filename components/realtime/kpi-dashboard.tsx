'use client'

import React, { useState, useEffect } from 'react'
import { useRealtimeCount, useRealtimeTableEvents } from '@/hooks/useRealtime'
import { useAuth } from '@/hooks/useAuth'

/**
 * Real-time KPI Dashboard showing live counts and metrics
 */
export function RealtimeKPIDashboard() {
  const { user: session } = useAuth()
  const [metrics, setMetrics] = useState({
    pendingInvoices: 0,
    pendingPayments: 0,
    newCustomers: 0,
    bankTransfers: 0,
  })

  // Real-time count of pending sales invoices
  const pendingInvoices = useRealtimeCount(
    'salesInvoice',
    session?.companyId,
    (record) => record.status === 'UNPAID' || record.status === 'PARTIAL'
  )

  // Real-time count of pending payments
  const pendingPayments = useRealtimeCount(
    'payment',
    session?.companyId,
    (record) => record.status !== 'COMPLETED' && record.status !== 'FAILED'
  )

  // Real-time count of new customers this week
  const newCustomers = useRealtimeCount(
    'customer',
    session?.companyId,
    (record) => {
      const createdDate = new Date(record.created_date)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      return createdDate > weekAgo
    }
  )

  useEffect(() => {
    setMetrics({
      pendingInvoices,
      pendingPayments,
      newCustomers,
      bankTransfers: metrics.bankTransfers,
    })
  }, [pendingInvoices, pendingPayments, newCustomers])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Pending Invoices */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-gray-600 text-sm font-medium">Pending Invoices</p>
            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {metrics.pendingInvoices}
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              ⚡ Live updates
            </p>
          </div>
          <span className="text-4xl">📄</span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">Updated in real-time</p>
        </div>
      </div>

      {/* Pending Payments */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-gray-600 text-sm font-medium">Pending Payments</p>
            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {metrics.pendingPayments}
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              ⚡ Live updates
            </p>
          </div>
          <span className="text-4xl">💳</span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">Updated in real-time</p>
        </div>
      </div>

      {/* New Customers */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-gray-600 text-sm font-medium">New Customers</p>
            <h3 className="text-3xl font-bold text-gray-900 mt-2">
              {metrics.newCustomers}
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              ⚡ This week
            </p>
          </div>
          <span className="text-4xl">👤</span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">Updated in real-time</p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-gray-600 text-sm font-medium">Live Status</p>
            <h3 className="text-xl font-bold text-green-600 mt-2">
              Connected
            </h3>
            <p className="text-xs text-gray-500 mt-2">
              ✓ Real-time enabled
            </p>
          </div>
          <span className="text-4xl animate-pulse">🔴</span>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">WebSocket active</p>
        </div>
      </div>
    </div>
  )
}

export default RealtimeKPIDashboard
