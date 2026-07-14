'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BuildingRegular, OpenRegular, PeopleRegular, ShieldRegular } from '@fluentui/react-icons';
export default function ExternalPortalsPage() {
  const [clientCount, setClientCount] = useState<number | null>(null)
  const [guardCount, setGuardCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(j => {
        const users: Array<{ role: string }> = j.users ?? []
        setClientCount(users.filter(u => u.role === 'CLIENT').length)
        setGuardCount(users.filter(u => u.role === 'GUARD').length)
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">External Portals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Dedicated portals for clients and guards to access their data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Portal */}
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 p-3">
              <BuildingRegular className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs text-brand-muted-light bg-muted px-2 py-0.5 rounded-full">Client Access</span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-foreground">Client Portal</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Clients access their invoices, payment history, active site deployments, and incident reports — securely.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PeopleRegular className="h-4 w-4 text-brand-muted-light" />
            {clientCount === null ? (
              <span className="text-brand-muted-light">Loading…</span>
            ) : (
              <span><strong>{clientCount}</strong> registered client {clientCount === 1 ? 'user' : 'users'}</span>
            )}
          </div>

          <Link
            href="/portal/client"
            target="_blank"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-brand-navy hover:bg-brand-navy-light text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Open Client Portal
            <OpenRegular className="h-4 w-4" />
          </Link>
        </div>

        {/* Guard Portal */}
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div className="rounded-lg bg-red-50 p-3">
              <ShieldRegular className="h-7 w-7 text-primary" />
            </div>
            <span className="text-xs text-brand-muted-light bg-muted px-2 py-0.5 rounded-full">Guard Access</span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-foreground">Guard Self-Service</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Guards view their deployment schedule, attendance records, and download payslips.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PeopleRegular className="h-4 w-4 text-brand-muted-light" />
            {guardCount === null ? (
              <span className="text-brand-muted-light">Loading…</span>
            ) : (
              <span><strong>{guardCount}</strong> registered guard {guardCount === 1 ? 'user' : 'users'}</span>
            )}
          </div>

          <Link
            href="/portal/guard"
            target="_blank"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-brand-red-dark text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Open Guard Portal
            <OpenRegular className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <strong>Note:</strong> Portal links open in a new tab. Users must have accounts with the appropriate role (CLIENT or GUARD) to log in.
        Create user accounts from <Link href="/settings/users" className="underline">Settings → Users</Link>.
      </div>
    </div>
  )
}
