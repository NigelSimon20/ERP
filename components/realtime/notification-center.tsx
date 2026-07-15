'use client'

import React, { useState, useEffect } from 'react'
import { useRealtimeNotifications } from '@/hooks/useRealtime'
import { useAuth } from '@/hooks/useAuth'

interface NotificationItem {
  id: string
  type: 'invoice' | 'payment' | 'customer' | 'supplier' | 'balance' | 'bank' | 'journal'
  title: string
  message: string
  timestamp: Date
  action?: string
  read: boolean
}

export function RealtimeNotificationCenter() {
  const { user: session } = useAuth()
  const { notifications } = useRealtimeNotifications(session?.companyId)
  const [displayNotifications, setDisplayNotifications] = useState<NotificationItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Convert realtime changes to display notifications
  useEffect(() => {
    const items: NotificationItem[] = notifications.map((change, idx) => {
      let type: NotificationItem['type'] = 'invoice'
      let title = ''
      let message = ''

      switch (change.table) {
        case 'sales_invoices':
          type = 'invoice'
          title = `Sales Invoice ${change.record.invoice_number}`
          message = `Invoice ${change.type.toLowerCase()}: $${change.record.total_amount}`
          break
        case 'purchase_invoices':
          type = 'invoice'
          title = `Purchase Invoice ${change.record.invoice_number}`
          message = `Bill ${change.type.toLowerCase()}`
          break
        case 'payments':
          type = 'payment'
          title = `Payment ${change.record.reference}`
          message = `Payment ${change.type.toLowerCase()}: $${change.record.amount}`
          break
        case 'customers':
          type = 'customer'
          title = `Customer: ${change.record.company_name}`
          message = `Customer ${change.type.toLowerCase()}`
          break
        case 'suppliers':
          type = 'supplier'
          title = `Supplier: ${change.record.company_name}`
          message = `Supplier ${change.type.toLowerCase()}`
          break
        case 'bank_accounts':
          type = 'bank'
          title = `Bank Account: ${change.record.account_name}`
          message = `Balance: $${change.record.current_balance}`
          break
        default:
          title = change.table
          message = `Record ${change.type.toLowerCase()}`
      }

      return {
        id: `${idx}-${Date.now()}`,
        type,
        title,
        message,
        timestamp: new Date(),
        action: change.type,
        read: false,
      }
    })

    setDisplayNotifications(items)
    setUnreadCount(items.length)
  }, [notifications])

  const getNotificationColor = (type: NotificationItem['type']) => {
    switch (type) {
      case 'invoice':
        return 'bg-blue-50 border-blue-200'
      case 'payment':
        return 'bg-green-50 border-green-200'
      case 'customer':
        return 'bg-purple-50 border-purple-200'
      case 'supplier':
        return 'bg-orange-50 border-orange-200'
      case 'balance':
        return 'bg-yellow-50 border-yellow-200'
      case 'bank':
        return 'bg-indigo-50 border-indigo-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const getNotificationIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'invoice':
        return '📄'
      case 'payment':
        return '💳'
      case 'customer':
        return '👤'
      case 'supplier':
        return '🏢'
      case 'balance':
        return '📊'
      case 'bank':
        return '🏦'
      default:
        return '📌'
    }
  }

  return (
    <div className="relative">
      {/* Notification Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-96 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
            <h3 className="font-semibold text-lg">Real-time Updates</h3>
            <p className="text-sm text-blue-100">
              {unreadCount} new {unreadCount === 1 ? 'update' : 'updates'}
            </p>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-96">
            {displayNotifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <p>No recent updates</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {displayNotifications.map(notif => (
                  <li
                    key={notif.id}
                    className={`p-4 border-l-4 border-transparent hover:bg-gray-50 transition-colors ${getNotificationColor(
                      notif.type
                    )}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{getNotificationIcon(notif.type)}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {notif.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          Just now
                        </p>
                      </div>
                      <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                        {notif.action}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 border-t border-gray-200 p-3 text-center">
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RealtimeNotificationCenter
