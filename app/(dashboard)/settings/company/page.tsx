'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

const tabs = [
  { key: 'company-info', label: 'Company Info' },
  { key: 'branding', label: 'Branding' },
  { key: 'invoice', label: 'Invoice Settings' },
  { key: 'banking', label: 'Banking' },
  { key: 'documents', label: 'Documents' },
  { key: 'portals', label: 'Portals' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'users', label: 'Users' },
  { key: 'access-control', label: 'Access Control' },
  { key: 'backup-restore', label: 'Backup & Restore' },
] as const

type TabKey = (typeof tabs)[number]['key']

function CompanyInfoTab() {
  const [company, setCompany] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        if (!res.ok) { toast.error(json.error ?? 'Failed to load company settings'); return }
        setCompany(json.company)
      } catch {
        toast.error('Network error loading company settings')
      }
    })()
  }, [])

  const save = async () => {
    if (!company) return
    setSaving(true)
    await fetch('/api/settings', { method: 'PUT', body: JSON.stringify(company) })
    setSaving(false)
  }

  if (!company) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">Update core company details and registration information. Changes to branding will apply immediately to generated invoices.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-card p-5">
          <label htmlFor="company-name" className="block text-sm font-medium">Company Name</label>
          <input id="company-name" title="Company Name" placeholder="Company Name" value={company.name||''} onChange={e=>setCompany({...company,name:e.target.value})} className="mt-1 input" />

          <label htmlFor="trading-name" className="block text-sm font-medium mt-4">Trading Name</label>
          <input id="trading-name" title="Trading Name" placeholder="Trading Name" value={company.tradingName||''} onChange={e=>setCompany({...company,tradingName:e.target.value})} className="mt-1 input" />

          <label htmlFor="company-motto" className="block text-sm font-medium mt-4">Motto</label>
          <input id="company-motto" title="Company Motto" placeholder="Company Motto" value={company.motto||''} onChange={e=>setCompany({...company,motto:e.target.value})} className="mt-1 input" />

          <label htmlFor="company-vat" className="block text-sm font-medium mt-4">VAT Number</label>
          <input id="company-vat" title="VAT Number" placeholder="VAT Number" value={company.vatNumber||''} onChange={e=>setCompany({...company,vatNumber:e.target.value})} className="mt-1 input" />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-card p-5">
          <label htmlFor="company-address" className="block text-sm font-medium">Address</label>
          <textarea id="company-address" title="Company Address" placeholder="Company Address" value={company.address||''} onChange={e=>setCompany({...company,address:e.target.value})} className="mt-1 textarea" />

          <label htmlFor="company-phone" className="block text-sm font-medium mt-4">Phone</label>
          <input id="company-phone" title="Company Phone" placeholder="Phone Number" value={company.phone||''} onChange={e=>setCompany({...company,phone:e.target.value})} className="mt-1 input" />

          <label htmlFor="company-email" className="block text-sm font-medium mt-4">Email</label>
          <input id="company-email" title="Company Email" placeholder="Email Address" value={company.email||''} onChange={e=>setCompany({...company,email:e.target.value})} className="mt-1 input" />
        </div>
      </div>

      <div className="flex justify-end">
        <button disabled={saving} onClick={save} className="btn btn-primary">Save</button>
      </div>
    </div>
  )
}

function BrandingTab() {
  const [company, setCompany] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        if (!res.ok) { toast.error(json.error ?? 'Failed to load company settings'); return }
        setCompany(json.company)
      } catch {
        toast.error('Network error loading company settings')
      }
    })()
  }, [])
  const save = async ()=>{ if(!company)return; setSaving(true); await fetch('/api/settings',{method:'PUT', body: JSON.stringify(company)}); setSaving(false) }
  if(!company) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-card p-5">
          <label htmlFor="company-logo" className="block text-sm font-medium">Logo URL</label>
          <input id="company-logo" title="Company Logo URL" placeholder="Logo URL" value={company.logo||''} onChange={e=>setCompany({...company,logo:e.target.value})} className="mt-1 input" />
          <label htmlFor="company-favicon" className="block text-sm font-medium mt-4">Favicon URL</label>
          <input id="company-favicon" title="Company Favicon URL" placeholder="Favicon URL" value={company.favicon||''} onChange={e=>setCompany({...company,favicon:e.target.value})} className="mt-1 input" />
          <label htmlFor="company-login-logo" className="block text-sm font-medium mt-4">Login Logo URL</label>
          <input id="company-login-logo" title="Login Logo URL" placeholder="Login Logo URL" value={company.loginLogo||''} onChange={e=>setCompany({...company,loginLogo:e.target.value})} className="mt-1 input" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-card p-5">
          <label htmlFor="company-primary-color" className="block text-sm font-medium">Primary Colour</label>
          <input id="company-primary-color" type="color" title="Primary Colour" value={company.primaryColor||'#0b5fff'} onChange={e=>setCompany({...company,primaryColor:e.target.value})} className="mt-1" />
          <label htmlFor="company-secondary-color" className="block text-sm font-medium mt-4">Secondary Colour</label>
          <input id="company-secondary-color" type="color" title="Secondary Colour" value={company.secondaryColor||'#f5f7fa'} onChange={e=>setCompany({...company,secondaryColor:e.target.value})} className="mt-1" />
          <label htmlFor="company-accent-color" className="block text-sm font-medium mt-4">Accent Colour</label>
          <input id="company-accent-color" type="color" title="Accent Colour" value={company.accentColor||'#06b6d4'} onChange={e=>setCompany({...company,accentColor:e.target.value})} className="mt-1" />
        </div>
      </div>
      <div className="flex justify-end">
        <button disabled={saving} onClick={save} className="btn btn-primary">Save Branding</button>
      </div>
    </div>
  )
}

function InvoiceTab() {
  const [company, setCompany] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        if (!res.ok) { toast.error(json.error ?? 'Failed to load company settings'); return }
        setCompany(json.company)
      } catch {
        toast.error('Network error loading company settings')
      }
    })()
  }, [])
  const save = async ()=>{ if(!company)return; setSaving(true); await fetch('/api/settings',{method:'PUT', body: JSON.stringify(company)}); setSaving(false) }
  if(!company) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <label htmlFor="invoice-prefix" className="block text-sm font-medium">Invoice Prefix</label>
        <input id="invoice-prefix" title="Invoice Prefix" placeholder="Invoice Prefix" value={company.invoicePrefix||''} onChange={e=>setCompany({...company,invoicePrefix:e.target.value})} className="mt-1 input" />
        <label htmlFor="next-invoice-number" className="block text-sm font-medium mt-4">Next Invoice Number</label>
        <input id="next-invoice-number" type="number" title="Next Invoice Number" placeholder="Next Invoice Number" value={company.nextInvoiceNumber||0} onChange={e=>setCompany({...company,nextInvoiceNumber: Number(e.target.value)})} className="mt-1 input" />
        <label htmlFor="footer-message" className="block text-sm font-medium mt-4">Footer Message</label>
        <textarea id="footer-message" title="Footer Message" placeholder="Footer Message" value={company.footerMessage||''} onChange={e=>setCompany({...company,footerMessage:e.target.value})} className="mt-1 textarea" />
      </div>
      <div className="flex justify-end">
        <button disabled={saving} onClick={save} className="btn btn-primary">Save Invoice Settings</button>
      </div>
    </div>
  )
}

function BankingTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Manage banking records, account details, and default ledger assignments for your company.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">Banking data placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Add, edit, or remove bank accounts and mark a default account for payments and receipts.</p>
      </div>
    </div>
  )
}

function DocumentsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Document numbering schemes and invoice sequence settings are stored here for consistent document control.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">Document numbering placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Configure prefixes, next numbering values, and document types for invoices, orders, and other records.</p>
      </div>
    </div>
  )
}

function PortalsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        External portals and integration endpoints can be managed from this section.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">Portal settings placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Store portal names, URLs, categories, and display tags for external services.</p>
      </div>
    </div>
  )
}

function NotificationsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Notification settings let you choose how your company receives alerts for system events and approvals.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">Notification preferences placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Configure email, SMS, and in-app notifications for critical workflows and user alerts.</p>
      </div>
    </div>
  )
}

function UsersTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        User settings and access roles are controlled from this section. Keep track of active accounts and role assignments.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">User management placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Create and manage user accounts, permissions, and profile settings for company staff.</p>
      </div>
    </div>
  )
}

function AccessControlTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Access control defines who can view and edit company settings and portal entries.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">Access control placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Manage roles, permissions, and secure access groups for business-critical settings.</p>
      </div>
    </div>
  )
}

function BackupRestoreTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Backup and restore tools help protect your company settings and stored configuration data.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <div className="text-sm font-medium text-slate-900">Backup & restore placeholder</div>
        <p className="mt-2 text-sm text-slate-500">Download backups, schedule restores, and keep company configuration data safe.</p>
      </div>
    </div>
  )
}

export default function CompanySettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('company-info')

  const renderTab = () => {
    switch (activeTab) {
      case 'company-info':
        return <CompanyInfoTab />
      case 'branding':
        return <BrandingTab />
      case 'invoice':
        return <InvoiceTab />
      case 'banking':
        return <BankingTab />
      case 'documents':
        return <DocumentsTab />
      case 'portals':
        return <PortalsTab />
      case 'notifications':
        return <NotificationsTab />
      case 'users':
        return <UsersTab />
      case 'access-control':
        return <AccessControlTab />
      case 'backup-restore':
        return <BackupRestoreTab />
      default:
        return <CompanyInfoTab />
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Company Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Configure your company information and system preferences.
        </p>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="inline-flex gap-2 min-w-full flex-wrap">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${isActive ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-transparent bg-card text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-slate-900">{tabs.find((tab) => tab.key === activeTab)?.label}</p>
            <p className="mt-1 text-sm text-slate-500">Manage the current module and update settings as needed.</p>
          </div>
        </div>
        <div className="space-y-6">{renderTab()}</div>
      </div>
    </div>
  )
}
