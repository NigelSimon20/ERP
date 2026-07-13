'use client'

import React, { useState } from 'react'
import { useRealtimeFinancial } from '@/hooks/useRealtime'
import { useAuth } from '@/hooks/useAuth'
import { RealtimeChange } from '@/lib/realtime'

/**
 * Live Activity Feed showing real-time transactions
 */
export function RealtimeLiveActivityFeed() {
  const { user: session } = useAuth()
  const [activities, setActivities] = useState<(RealtimeChange & { id: string })[]>([])

  // Subscribe to all financial changes
  useRealtimeFinancial(session?.companyId, (change) => {
    // Skip balance updates to reduce noise
    if (change.table === 'bankAccount' && change.type === 'UPDATE') {
      return
    }

    const activity = {
      ...change,
      id: `${change.table}-${change.record.id}-${Date.now()}`,
    }

    setActivities(prev => [activity, ...prev].slice(0, 100))
  })

  const getActivityDescription = (change: RealtimeChange) => {
    const action = change.type.toLowerCase()
    const amount = change.record.total_amount || change.record.amount || 0

    switch (change.table) {
      case 'salesInvoice':
        return `Sales invoice #${change.record.invoiceNumber} ${action}${
          amount ? ` for $${Number(amount).toFixed(2)}` : ''
        }`
      case 'purchaseInvoice':
        return `Purchase invoice #${change.record.invoiceNumber} ${action}`
      case 'payment':
        return `Payment ${action} for $${Number(change.record.amount || 0).toFixed(2)}`
      case 'customer':
        return `Customer "${change.record.company_name}" ${action}`
      case 'supplier':
        return `Supplier "${change.record.company_name}" ${action}`
      case 'bankAccount':
        return `Bank account balance updated to $${Number(
          change.record.current_balance || 0
        ).toFixed(2)}`
      default:
        return `${change.table} ${action}`
    }
  }

  const getActivityIcon = (change: RealtimeChange) => {
    switch (change.table) {
      case 'salesInvoice':
      case 'purchaseInvoice':
        return change.type === 'INSERT' ? '📝' : '📄'
      case 'payment':
        return '💰'
      case 'customer':
        return '👤'
      case 'supplier':
        return '🏢'
      case 'bankAccount':
        return '🏦'
      default:
        return '📌'
    }
  }

  const getActivityColor = (change: RealtimeChange) => {
    switch (change.type) {
      case 'INSERT':
        return 'border-green-500 bg-green-50'
      case 'UPDATE':
        return 'border-blue-500 bg-blue-50'
      case 'DELETE':
        return 'border-red-500 bg-red-50'
      default:
        return 'border-gray-500 bg-gray-50'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">Live Activity Feed</h2>
        <p className="text-sm text-gray-600 mt-1">
          Real-time transaction updates across your system
        </p>
      </div>

      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No recent activity</p>
          </div>
        ) : (
          activities.map(activity => (
            <div
              key={activity.id}
              className={`p-4 border-l-4 ${getActivityColor(activity)} hover:bg-opacity-75 transition-colors`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-1">{getActivityIcon(activity)}</span>

                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {getActivityDescription(activity)}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span>
                      {activity.type === 'INSERT' && '✨ Created'}
                      {activity.type === 'UPDATE' && '📝 Updated'}
                      {activity.type === 'DELETE' && '🗑️ Deleted'}
                    </span>
                    <span>•</span>
                    <span>Just now</span>
                  </div>
                </div>

                <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                  {activity.table}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          View full activity log →
        </button>
      </div>
    </div>
  )
}

export default RealtimeLiveActivityFeed
