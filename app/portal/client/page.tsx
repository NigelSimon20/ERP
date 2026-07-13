'use client'

import { useState, useEffect } from 'react'
import { FaShieldAlt, FaBuilding, FaSignOutAlt, FaFileAlt, FaCreditCard, FaMapMarkerAlt, FaExclamationTriangle } from 'react-icons/fa'
import * as Tabs from '@radix-ui/react-tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatDate, formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface SessionUser { id: string; name: string; email: string; role: string; companyId: string }
interface Invoice { id: string; invoiceNumber: string; issueDate: string; dueDate: string; totalAmount: number; paidAmount: number; balanceDue: number; status: string }
interface Receipt { id: string; reference: string; receiptDate: string; amount: number; notes: string | null }
interface Site { id: string; name: string; address: string; status: string; guardsRequired: number }
interface Incident { id: string; title: string; severity: string; status: string; reportedAt: string }

import theme from '@/lib/theme'

const STATUS_COLORS: Record<string, string> = {
  PAID: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  UNPAID: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  PARTIAL: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  OVERDUE: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  VOID: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  MEDIUM: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  HIGH: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
  CRITICAL: `bg-[${theme.PRIMARY_BG}] text-[${theme.PRIMARY}]`,
}

export default function ClientPortalPage() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // Check existing session
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(j => {
        if (j.user?.role === 'CLIENT') setUser(j.user)
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  // Load portal data after login
  useEffect(() => {
    if (!user) return
    setDataLoading(true)
    Promise.all([
      fetch('/api/finance/sales-invoices').then(r => r.json()).catch(() => ({ invoices: [] })),
      fetch('/api/finance/receipts').then(r => r.json()).catch(() => ({ receipts: [] })),
      fetch('/api/operations/sites').then(r => r.json()).catch(() => ({ sites: [] })),
      fetch('/api/operations/incidents').then(r => r.json()).catch(() => ({ incidents: [] })),
    ]).then(([inv, rec, sit, inc]) => {
      setInvoices((inv.invoices ?? []).map((i: Record<string, unknown>) => ({ ...i, totalAmount: Number(i.totalAmount), paidAmount: Number(i.paidAmount), balanceDue: Number(i.balanceDue) })))
      setReceipts(rec.receipts ?? [])
      setSites(sit.sites ?? [])
      setIncidents(inc.incidents ?? [])
    }).finally(() => setDataLoading(false))
  }, [user])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Login failed'); return }
      if (json.user?.role !== 'CLIENT') { toast.error('This portal is for clients only'); return }
      setUser(json.user)
    } catch { toast.error('Network error') }
    finally { setLoginLoading(false) }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <FaShieldAlt size={28} className="text-[#CC0000]" />
              <span className="text-xl font-bold text-[#0D1B2A]">Ravenshield</span>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-3 py-1 text-xs font-medium">
              <FaBuilding className="h-3 w-3" /> Client Portal
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h1 className="text-lg font-bold text-[#0D1B2A] mb-5">Sign in to your portal</h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" disabled={loginLoading} className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white">
                {loginLoading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0D1B2A] text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaShieldAlt size={20} className="text-[#CC0000]" />
            <span className="font-bold">Ravenshield</span>
            <span className="text-gray-400 text-sm mx-1">·</span>
            <span className="text-sm text-gray-300">Client Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-300">{user.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
              aria-label="Logout"
            >
              <FaSignOutAlt className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-[#0D1B2A] mb-4">Welcome, {user.name}</h1>

        {dataLoading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <Tabs.Root defaultValue="invoices">
            <Tabs.List className="flex gap-1 border-b border-gray-200 mb-5">
              {[
                { value: 'invoices', label: 'Invoices', icon: FaFileAlt },
                { value: 'payments', label: 'Payments', icon: FaCreditCard },
                { value: 'sites', label: 'My Sites', icon: FaMapMarkerAlt },
                { value: 'incidents', label: 'Incidents', icon: FaExclamationTriangle },
              ].map(({ value, label, icon: Icon }) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent data-[state=active]:border-[#CC0000] data-[state=active]:text-[#CC0000] transition-colors"
                >
                  <Icon className="h-4 w-4" /> {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="invoices">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {invoices.length === 0 ? <p className="text-sm text-gray-400 text-center py-12">No invoices</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Invoice #</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Issue Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Due Date</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">Balance Due</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-[#0D1B2A]">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(inv.issueDate)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(inv.dueDate)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(inv.totalAmount)}</td>
                          <td className="px-4 py-3 text-right font-medium text-[#0D1B2A]">{formatCurrency(inv.balanceDue)}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? ''}`}>{inv.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="payments">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {receipts.length === 0 ? <p className="text-sm text-gray-400 text-center py-12">No payment records</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Reference</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {receipts.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-[#0D1B2A]">{r.reference}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(r.receiptDate)}</td>
                          <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(Number(r.amount))}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{r.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="sites">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sites.length === 0 ? <p className="text-sm text-gray-400 py-8">No sites found</p> : sites.map(site => (
                  <div key={site.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-[#0D1B2A]">{site.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{site.address}</p>
                      </div>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${site.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{site.status}</span>
                    </div>
                    <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
                      <FaMapMarkerAlt className="h-3 w-3" /> {site.guardsRequired} guard{site.guardsRequired !== 1 ? 's' : ''} required
                    </div>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="incidents">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {incidents.length === 0 ? <p className="text-sm text-gray-400 text-center py-12">No incidents</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Title</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Severity</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Reported</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {incidents.map(inc => (
                        <tr key={inc.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-[#0D1B2A]">{inc.title}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[inc.severity] ?? ''}`}>{inc.severity}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-500">{inc.status}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{formatDate(inc.reportedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        )}
      </main>
    </div>
  )
}
