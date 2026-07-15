'use client'

import { useState } from 'react'
import {
  ReceiptMoneyRegular, PaymentRegular, PersonRegular, BuildingRegular, BuildingBankRegular, DocumentRegular,
  AddCircleRegular, EditRegular, DeleteRegular,
} from '@fluentui/react-icons'
import { useRealtimeFinancial } from '@/hooks/useRealtime'
import { useAuth } from '@/hooks/useAuth'
import { RealtimeChange } from '@/lib/realtime'
import { formatCurrency } from '@/lib/utils'
import { LiveBadge } from './kpi-dashboard'

const TABLE_META: Record<string, { label: string; icon: React.ElementType }> = {
  sales_invoices: { label: 'Sales invoice', icon: ReceiptMoneyRegular },
  purchase_invoices: { label: 'Purchase invoice', icon: ReceiptMoneyRegular },
  payments: { label: 'Payment', icon: PaymentRegular },
  customers: { label: 'Customer', icon: PersonRegular },
  suppliers: { label: 'Supplier', icon: BuildingRegular },
  bank_accounts: { label: 'Bank account', icon: BuildingBankRegular },
}

const ACTION_ICON: Record<string, React.ElementType> = {
  INSERT: AddCircleRegular,
  UPDATE: EditRegular,
  DELETE: DeleteRegular,
}

function describe(change: RealtimeChange): string {
  const r = change.record
  switch (change.table) {
    case 'sales_invoices':
      return `Invoice ${r.invoice_number ?? ''} ${change.type === 'INSERT' ? 'created' : 'updated'}${r.total_amount ? ` — ${formatCurrency(Number(r.total_amount))}` : ''}`
    case 'purchase_invoices':
      return `Purchase invoice ${r.invoice_number ?? ''} ${change.type.toLowerCase()}`
    case 'payments':
      return `Payment ${change.type.toLowerCase()}${r.amount ? ` — ${formatCurrency(Number(r.amount))}` : ''}`
    case 'customers':
      return `Customer "${r.company_name ?? ''}" ${change.type.toLowerCase()}`
    case 'suppliers':
      return `Supplier "${r.company_name ?? ''}" ${change.type.toLowerCase()}`
    case 'bank_accounts':
      return `${r.bank_name ?? 'Bank account'} balance updated${r.current_balance != null ? ` — ${formatCurrency(Number(r.current_balance))}` : ''}`
    default:
      return `${change.table} ${change.type.toLowerCase()}`
  }
}

/** Live feed of financial changes pushed via Supabase Realtime. */
export function RealtimeLiveActivityFeed() {
  const { user } = useAuth()
  const [activities, setActivities] = useState<(RealtimeChange & { id: string })[]>([])

  useRealtimeFinancial(user?.companyId, (change) => {
    if (change.table === 'bank_accounts' && change.type === 'UPDATE') return
    setActivities(prev => [{ ...change, id: `${change.table}-${change.record.id}-${Date.now()}` }, ...prev].slice(0, 20))
  })

  return (
    <div className="bg-card erp-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Live Activity</h3>
        <LiveBadge />
      </div>
      {activities.length === 0 ? (
        <p className="text-sm text-brand-muted-light text-center py-6">Waiting for activity…</p>
      ) : (
        <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {activities.map(activity => {
            const meta = TABLE_META[activity.table]
            const Icon = meta?.icon ?? DocumentRegular
            const ActionIcon = ACTION_ICON[activity.type] ?? EditRegular
            return (
              <li key={activity.id} className="flex items-start gap-3 py-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{describe(activity)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta?.label ?? activity.table}</p>
                </div>
                <ActionIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default RealtimeLiveActivityFeed
