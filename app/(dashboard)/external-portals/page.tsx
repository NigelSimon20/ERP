'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FaBuilding, FaShieldAlt, FaExternalLinkAlt, FaUsers } from 'react-icons/fa'

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
        <h1 className="text-xl font-bold text-[#0D1B2A]">External Portals</h1>
        <p className="text-sm text-gray-500 mt-0.5">Dedicated portals for clients and guards to access their data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Portal */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div className="rounded-lg bg-blue-50 p-3">
              <FaBuilding className="h-7 w-7 text-blue-600" />
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Client Access</span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#0D1B2A]">Client Portal</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Clients access their invoices, payment history, active site deployments, and incident reports — securely.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FaUsers className="h-4 w-4 text-gray-400" />
            {clientCount === null ? (
              <span className="text-gray-400">Loading…</span>
            ) : (
              <span><strong>{clientCount}</strong> registered client {clientCount === 1 ? 'user' : 'users'}</span>
            )}
          </div>

          <Link
            href="/portal/client"
            target="_blank"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#0D1B2A] hover:bg-[#1a2f4a] text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Open Client Portal
            <FaExternalLinkAlt className="h-4 w-4" />
          </Link>
        </div>

        {/* Guard Portal */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div className="rounded-lg bg-red-50 p-3">
              <FaShieldAlt className="h-7 w-7 text-[#CC0000]" />
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Guard Access</span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#0D1B2A]">Guard Self-Service</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Guards view their deployment schedule, attendance records, and download payslips.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FaUsers className="h-4 w-4 text-gray-400" />
            {guardCount === null ? (
              <span className="text-gray-400">Loading…</span>
            ) : (
              <span><strong>{guardCount}</strong> registered guard {guardCount === 1 ? 'user' : 'users'}</span>
            )}
          </div>

          <Link
            href="/portal/guard"
            target="_blank"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-[#CC0000] hover:bg-[#AA0000] text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            Open Guard Portal
            <FaExternalLinkAlt className="h-4 w-4" />
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
