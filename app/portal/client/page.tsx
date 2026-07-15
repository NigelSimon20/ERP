'use client'

import { useState, useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatDate, formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { BuildingRegular, DocumentRegular, LocationRegular, PaymentRegular, ShieldRegular, SignOutRegular, WarningRegular } from '@fluentui/react-icons';

interface SessionUser { id: string; name: string; email: string; role: string; companyId: string }
interface Invoice { id: string; invoiceNumber: string; issueDate: string; dueDate: string; totalAmount: number; paidAmount: number; balanceDue: number; status: string }
interface Receipt { id: string; reference: string; receiptDate: string; amount: number; notes: string | null }
interface Site { id: string; name: string; address: string; status: string; guardsRequired: number }
interface Incident { id: string; title: string; severity: string; status: string; reportedAt: string }

const STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  UNPAID: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  PARTIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  OVERDUE: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
  VOID: 'bg-muted text-muted-foreground',
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  HIGH: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  CRITICAL: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
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
      fetch('/api/portal/client/invoices').then(r => r.json()).catch(() => ({ invoices: [] })),
      fetch('/api/portal/client/receipts').then(r => r.json()).catch(() => ({ receipts: [] })),
      fetch('/api/portal/client/sites').then(r => r.json()).catch(() => ({ sites: [] })),
      fetch('/api/portal/client/incidents').then(r => r.json()).catch(() => ({ incidents: [] })),
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
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-muted/50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <ShieldRegular fontSize={28} className="text-primary" />
              <span className="text-xl font-bold text-foreground">Ravenshield</span>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-full px-3 py-1 text-xs font-medium">
              <BuildingRegular className="h-3 w-3" /> Client Portal
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <h1 className="text-lg font-bold text-foreground mb-5">Sign in to your portal</h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" disabled={loginLoading} className="w-full bg-primary hover:bg-brand-red-dark text-white">
                {loginLoading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <header className="bg-brand-navy text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldRegular fontSize={20} className="text-primary" />
            <span className="font-bold">Ravenshield</span>
            <span className="text-brand-muted-light text-sm mx-1">·</span>
            <span className="text-sm text-brand-muted-light">Client Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-muted-light">{user.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-brand-muted-light hover:text-white transition-colors"
              aria-label="Logout"
            >
              <SignOutRegular className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-foreground mb-4">Welcome, {user.name}</h1>

        {dataLoading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <Tabs.Root defaultValue="invoices">
            <Tabs.List className="flex gap-1 border-b border-border mb-5">
              {[
                { value: 'invoices', label: 'Invoices', icon: DocumentRegular },
                { value: 'payments', label: 'Payments', icon: PaymentRegular },
                { value: 'sites', label: 'My Sites', icon: LocationRegular },
                { value: 'incidents', label: 'Incidents', icon: WarningRegular },
              ].map(({ value, label, icon: Icon }) => (
                <Tabs.Trigger
                  key={value}
                  value={value}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary transition-colors"
                >
                  <Icon className="h-4 w-4" /> {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="invoices">
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {invoices.length === 0 ? <p className="text-sm text-brand-muted-light text-center py-12">No invoices</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invoice #</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Issue Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Due Date</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Balance Due</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium text-foreground">{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(inv.issueDate)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(inv.dueDate)}</td>
                          <td className="px-4 py-3 text-right text-foreground">{formatCurrency(inv.totalAmount)}</td>
                          <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.balanceDue)}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? ''}`}>{inv.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="payments">
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {receipts.length === 0 ? <p className="text-sm text-brand-muted-light text-center py-12">No payment records</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reference</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {receipts.map(r => (
                        <tr key={r.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium text-foreground">{r.reference}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(r.receiptDate)}</td>
                          <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(Number(r.amount))}</td>
                          <td className="px-4 py-3 text-brand-muted-light text-xs">{r.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Tabs.Content>

            <Tabs.Content value="sites">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sites.length === 0 ? <p className="text-sm text-brand-muted-light py-8">No sites found</p> : sites.map(site => (
                  <div key={site.id} className="bg-card rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{site.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{site.address}</p>
                      </div>
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${site.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{site.status}</span>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                      <LocationRegular className="h-3 w-3" /> {site.guardsRequired} guard{site.guardsRequired !== 1 ? 's' : ''} required
                    </div>
                  </div>
                ))}
              </div>
            </Tabs.Content>

            <Tabs.Content value="incidents">
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {incidents.length === 0 ? <p className="text-sm text-brand-muted-light text-center py-12">No incidents</p> : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Severity</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reported</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {incidents.map(inc => (
                        <tr key={inc.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium text-foreground">{inc.title}</td>
                          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[inc.severity] ?? ''}`}>{inc.severity}</span></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{inc.status}</td>
                          <td className="px-4 py-3 text-xs text-brand-muted-light">{formatDate(inc.reportedAt)}</td>
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
