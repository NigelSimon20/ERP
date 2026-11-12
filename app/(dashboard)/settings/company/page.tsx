'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import PortalsTab from '@/components/settings/PortalsTab'
import { hexToHslTriplet } from '@/lib/color'

// Mini live mockup of the sidebar/header/button chrome, using the exact same
// CSS-var mechanism (--company-sidebar/--company-header/--company-button)
// the real app shell reads -- so what's shown here is a faithful preview,
// not a separate re-implementation that could drift from reality.
function ChromePreview({ headerColor, sidebarColor, buttonColor, primaryColor }: { headerColor: string; sidebarColor: string; buttonColor: string; primaryColor: string }) {
  const fallback = primaryColor || '#0b5fff'
  const vars = {
    ['--company-header']: hexToHslTriplet(headerColor || fallback),
    ['--company-sidebar']: hexToHslTriplet(sidebarColor || fallback),
    ['--company-button']: hexToHslTriplet(buttonColor || fallback),
  } as React.CSSProperties
  return (
    <div style={vars} className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex h-24">
        <div className="w-16 bg-white p-2 space-y-1.5 border-r border-slate-200 flex-shrink-0">
          <div className="h-2 w-10 rounded-full bg-[hsl(var(--company-sidebar))]" />
          <div className="h-5 rounded bg-[hsl(var(--company-sidebar)/0.1)] flex items-center px-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--company-sidebar))]" />
          </div>
          <div className="h-2 w-8 rounded-full bg-slate-200" />
          <div className="h-2 w-9 rounded-full bg-slate-200" />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-8 bg-white border-b border-slate-200 flex items-center justify-end px-2 flex-shrink-0">
            <div className="h-4 w-4 rounded-full bg-[hsl(var(--company-header))]" />
          </div>
          <div className="flex-1 bg-slate-50 flex items-center justify-center">
            <span className="px-3 py-1 rounded text-white text-[10px] font-medium bg-[hsl(var(--company-button))]">Button</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const tabs = [
  { key: 'company-info', label: 'Company Info' },
  { key: 'branding', label: 'Branding' },
  { key: 'invoice', label: 'Invoice Settings' },
  { key: 'tax', label: 'Tax Settings' },
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
  const [uploadingLogo, setUploadingLogo] = useState(false)

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

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !company) return
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/settings/logo', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Logo upload failed'); return }
      setCompany({ ...company, logo: json.logo })
      toast.success('Logo uploaded')
    } catch {
      toast.error('Network error uploading logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  if(!company) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-card p-5">
          <label className="block text-sm font-medium">Logo</label>
          <div className="mt-1 flex items-center gap-3">
            {company.logo ? (
              <img src={company.logo} alt="Company logo" className="h-14 w-14 object-contain rounded border border-slate-200 bg-white" />
            ) : (
              <div className="h-14 w-14 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">No logo</div>
            )}
            <div className="flex-1">
              <input type="file" accept="image/png,image/jpeg,image/webp" title="Upload company logo" onChange={uploadLogo} disabled={uploadingLogo} className="text-sm" />
              <p className="text-xs text-slate-500 mt-1">{uploadingLogo ? 'Uploading…' : 'PNG, JPEG, or WEBP — under 5 MB. Saved immediately, shows on generated PDFs.'}</p>
            </div>
          </div>
          <label htmlFor="company-logo" className="block text-xs text-slate-500 mt-3">Or paste an image URL directly</label>
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

        <div className="rounded-2xl border border-slate-200 bg-card p-5 md:col-span-2">
          <p className="text-sm font-semibold">App Chrome &amp; Document Colours</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            Colour the sidebar, top bar, and buttons across the whole app, plus the accent used
            in generated PDF reports. Leave any of these unset to keep using Primary Colour above.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <div>
              <label htmlFor="company-header-color" className="block text-sm font-medium">Header Colour</label>
              <input id="company-header-color" type="color" title="Header Colour" value={company.headerColor||company.primaryColor||'#0b5fff'} onChange={e=>setCompany({...company,headerColor:e.target.value})} className="mt-1" />
            </div>
            <div>
              <label htmlFor="company-sidebar-color" className="block text-sm font-medium">Sidebar Colour</label>
              <input id="company-sidebar-color" type="color" title="Sidebar Colour" value={company.sidebarColor||company.primaryColor||'#0b5fff'} onChange={e=>setCompany({...company,sidebarColor:e.target.value})} className="mt-1" />
            </div>
            <div>
              <label htmlFor="company-button-color" className="block text-sm font-medium">Button Colour</label>
              <input id="company-button-color" type="color" title="Button Colour" value={company.buttonColor||company.primaryColor||'#0b5fff'} onChange={e=>setCompany({...company,buttonColor:e.target.value})} className="mt-1" />
            </div>
            <div>
              <label htmlFor="company-pdf-theme-color" className="block text-sm font-medium">PDF Theme Colour</label>
              <input id="company-pdf-theme-color" type="color" title="PDF Theme Colour" value={company.pdfThemeColor||company.primaryColor||'#0b5fff'} onChange={e=>setCompany({...company,pdfThemeColor:e.target.value})} className="mt-1" />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Live preview</p>
          <ChromePreview headerColor={company.headerColor} sidebarColor={company.sidebarColor} buttonColor={company.buttonColor} primaryColor={company.primaryColor} />
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

const GL_MAPPING_FIELDS: { key: string; label: string; type: string; help: string }[] = [
  { key: 'receivablesAccountId', label: 'Accounts Receivable', type: 'ASSET', help: 'Debited on every new Sales Invoice.' },
  { key: 'payablesAccountId', label: 'Accounts Payable', type: 'LIABILITY', help: 'Credited on every new Purchase Invoice; debited when a supplier bill is settled.' },
  { key: 'vatAccountId', label: 'VAT Payable', type: 'LIABILITY', help: 'Credited for tax collected on invoices with tax enabled.' },
  { key: 'salariesExpenseAccountId', label: 'Salaries Expense', type: 'EXPENSE', help: 'Debited for gross pay on every payroll run.' },
  { key: 'payrollLiabilitiesAccountId', label: 'Payroll Liabilities', type: 'LIABILITY', help: 'Credited for total deductions on every payroll run.' },
  { key: 'fixedAssetsAccountId', label: 'Fixed Assets', type: 'ASSET', help: 'Debited when an asset is registered.' },
  { key: 'accumulatedDepreciationAccountId', label: 'Accumulated Depreciation', type: 'ASSET', help: 'Credited by the month-end depreciation run (contra-asset).' },
  { key: 'depreciationExpenseAccountId', label: 'Depreciation Expense', type: 'EXPENSE', help: 'Debited by the month-end depreciation run.' },
  { key: 'inventoryAccountId', label: 'Inventory', type: 'ASSET', help: 'Debited when stock is added.' },
]

function GLAccountMappingSection({ company, setCompany }: { company: any; setCompany: (c: any) => void }) {
  const [accounts, setAccounts] = useState<{ id: string; account_name: string | null; account_code: string | null; account_type: string | null }[]>([])
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/finance/accounts')
        const json = await res.json()
        if (res.ok) setAccounts(json.accounts ?? [])
      } catch {
        // Non-fatal — dropdowns just render empty if the chart of accounts can't load.
      }
    })()
  }, [])

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold">General Ledger Account Mapping</p>
        <p className="text-xs text-slate-500 mt-1">
          Invoices, payments, and payroll post to these accounts automatically. Until each is set,
          the corresponding transaction type is blocked from posting to the GL rather than posting
          silently to the wrong place.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {GL_MAPPING_FIELDS.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className="block text-sm font-medium">{field.label}</label>
            <select
              id={field.key}
              title={field.label}
              value={company[field.key] ?? ''}
              onChange={(e) => setCompany({ ...company, [field.key]: e.target.value || null })}
              className="mt-1 input"
            >
              <option value="">Not configured</option>
              {accounts.filter((a) => a.account_type === field.type).map((a) => (
                <option key={a.id} value={a.id}>{a.account_code ? `${a.account_code} — ${a.account_name}` : a.account_name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">{field.help}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaxTab() {
  const [company, setCompany] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        if (!res.ok) { toast.error(json.error ?? 'Failed to load tax settings'); return }
        setCompany(json.company)
      } catch {
        toast.error('Network error loading tax settings')
      }
    })()
  }, [])
  const save = async () => {
    if (!company) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxName: company.taxName,
          taxRate: company.taxRate,
          taxNumber: company.taxNumber,
          taxEnabled: company.taxEnabled,
          taxInclusive: company.taxInclusive,
          taxAppliedByDefault: company.taxAppliedByDefault,
          vatAccountId: company.vatAccountId,
          receivablesAccountId: company.receivablesAccountId,
          payablesAccountId: company.payablesAccountId,
          salariesExpenseAccountId: company.salariesExpenseAccountId,
          payrollLiabilitiesAccountId: company.payrollLiabilitiesAccountId,
          fixedAssetsAccountId: company.fixedAssetsAccountId,
          accumulatedDepreciationAccountId: company.accumulatedDepreciationAccountId,
          depreciationExpenseAccountId: company.depreciationExpenseAccountId,
          inventoryAccountId: company.inventoryAccountId,
          allowUnappliedCredit: company.allowUnappliedCredit,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to save tax settings'); return }
      setCompany(json.company)
      toast.success('Tax settings saved')
    } catch {
      toast.error('Network error saving tax settings')
    } finally {
      setSaving(false)
    }
  }
  if (!company) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Configure the tax that applies to new Sales Invoices, Purchase Invoices, and Quotations. Existing documents keep the tax value they were created with.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6 space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={!!company.taxEnabled} onChange={e => setCompany({ ...company, taxEnabled: e.target.checked })} />
          Enable Tax
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="tax-name" className="block text-sm font-medium">Tax Name</label>
            <input id="tax-name" title="Tax Name" placeholder="VAT" value={company.taxName || ''} onChange={e => setCompany({ ...company, taxName: e.target.value })} disabled={!company.taxEnabled} className="mt-1 input" />
          </div>
          <div>
            <label htmlFor="tax-percentage" className="block text-sm font-medium">Tax Percentage (%)</label>
            <input id="tax-percentage" type="number" step="0.01" min="0" max="100" title="Tax Percentage" placeholder="0" value={company.taxRate ?? 0} onChange={e => setCompany({ ...company, taxRate: Number(e.target.value) })} disabled={!company.taxEnabled} className="mt-1 input" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="tax-number" className="block text-sm font-medium">Tax Registration Number</label>
            <input id="tax-number" title="Tax Registration Number" placeholder="Tax Registration Number" value={company.taxNumber || ''} onChange={e => setCompany({ ...company, taxNumber: e.target.value })} disabled={!company.taxEnabled} className="mt-1 input" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={!!company.taxInclusive} onChange={e => setCompany({ ...company, taxInclusive: e.target.checked })} disabled={!company.taxEnabled} />
          Tax Inclusive Pricing
        </label>
        <p className="text-xs text-slate-500 -mt-2 ml-6">When enabled, line item prices are treated as already including tax; tax is extracted from the price instead of added on top.</p>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={!!company.allowUnappliedCredit} onChange={e => setCompany({ ...company, allowUnappliedCredit: e.target.checked })} />
          Allow unapplied credit
        </label>
        <p className="text-xs text-slate-500 -mt-2 ml-6">When a credit or debit note is larger than what is left on its invoice or bill, keep the excess as credit for the customer or supplier. When off, such a note is rejected.</p>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={!!company.taxAppliedByDefault} onChange={e => setCompany({ ...company, taxAppliedByDefault: e.target.checked })} disabled={!company.taxEnabled} />
          Apply Tax By Default To New Lines
        </label>
      </div>

      <GLAccountMappingSection company={company} setCompany={setCompany} />

      <div className="flex justify-end">
        <button disabled={saving} onClick={save} className="btn btn-primary">Save Tax Settings</button>
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
  const [company, setCompany] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        if (!res.ok) { toast.error(json.error ?? 'Failed to load document settings'); return }
        setCompany(json.company)
      } catch {
        toast.error('Network error loading document settings')
      }
    })()
  }, [])
  const save = async () => {
    if (!company) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCodePrefix: company.employeeCodePrefix,
          nextEmployeeNumber: company.nextEmployeeNumber,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to save document settings'); return }
      setCompany(json.company)
      toast.success('Document numbering settings saved')
    } catch {
      toast.error('Network error saving document settings')
    } finally {
      setSaving(false)
    }
  }
  if (!company) return <div>Loading...</div>

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Document numbering schemes are stored here for consistent document control. Invoice, quotation, and other prefixes are managed on their own tabs — this covers employee numbering.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-card p-6">
        <label htmlFor="employee-code-prefix" className="block text-sm font-medium">Employee Code Prefix</label>
        <input id="employee-code-prefix" title="Employee Code Prefix" placeholder="EMP" value={company.employeeCodePrefix || ''} onChange={e => setCompany({ ...company, employeeCodePrefix: e.target.value })} className="mt-1 input" />
        <label htmlFor="next-employee-number" className="block text-sm font-medium mt-4">Next Employee Number</label>
        <input id="next-employee-number" type="number" title="Next Employee Number" placeholder="Next Employee Number" value={company.nextEmployeeNumber || 1} onChange={e => setCompany({ ...company, nextEmployeeNumber: Number(e.target.value) })} className="mt-1 input" />
      </div>
      <div className="flex justify-end">
        <button disabled={saving} onClick={save} className="btn btn-primary">Save Document Settings</button>
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
  const [downloading, setDownloading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [preview, setPreview] = useState<{ file: File; counts: Record<string, number>; data: Record<string, unknown[]> } | null>(null)

  const downloadBackup = async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/settings/backup/export')
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j.error ?? 'Backup failed'); return }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="(.+)"/)
      const filename = match?.[1] ?? `ravenshield-backup-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded')
    } catch {
      toast.error('Network error downloading backup')
    } finally {
      setDownloading(false)
    }
  }

  const handleFileSelected = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed.data !== 'object') {
        toast.error('Not a recognized Ravenshield backup file')
        return
      }
      const res = await fetch('/api/settings/backup/restore?dryRun=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsed.data }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not read backup file'); return }
      setPreview({ file, counts: json.counts, data: parsed.data })
    } catch {
      toast.error('Could not parse that file as JSON')
    }
  }

  const confirmRestore = async () => {
    if (!preview) return
    setRestoring(true)
    try {
      const res = await fetch('/api/settings/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: preview.data }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Restore failed'); return }
      const totalRestored = Object.values(json.results as Record<string, { restored: number; failed: number }>).reduce((sum, r) => sum + r.restored, 0)
      const totalFailed = Object.values(json.results as Record<string, { restored: number; failed: number }>).reduce((sum, r) => sum + r.failed, 0)
      toast.success(`Restored ${totalRestored} records${totalFailed ? ` (${totalFailed} failed)` : ''}`)
      setPreview(null)
    } catch {
      toast.error('Network error during restore')
    } finally {
      setRestoring(false)
    }
  }

  const nonZeroCounts = preview ? Object.entries(preview.counts).filter(([, n]) => n > 0) : []

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-slate-600">
        Download a full backup of your company&apos;s data at any time, or restore from a previously downloaded backup file. Restoring never deletes existing records — it only adds or updates.
      </p>

      <div className="rounded-2xl border border-slate-200 bg-card p-6 space-y-3">
        <div className="text-sm font-medium text-slate-900">Local backup</div>
        <p className="text-sm text-slate-500">Download every table in your company&apos;s data as a single JSON file.</p>
        <button type="button" disabled={downloading} onClick={downloadBackup} className="btn btn-primary">
          {downloading ? 'Preparing…' : 'Download Backup Now'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-card p-6 space-y-3">
        <div className="text-sm font-medium text-slate-900">Restore from file</div>
        <p className="text-sm text-slate-500">Choose a Ravenshield backup JSON file. You&apos;ll see a preview of what will be restored before anything is written.</p>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f) }}
          className="text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />

        {preview && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-900">Ready to restore from &quot;{preview.file.name}&quot;</p>
            <div className="max-h-48 overflow-y-auto text-sm text-slate-600 grid grid-cols-2 gap-x-6 gap-y-1">
              {nonZeroCounts.length === 0
                ? <p className="col-span-2 text-slate-500">No recognized records found in this file.</p>
                : nonZeroCounts.map(([table, count]) => (
                  <div key={table} className="flex justify-between">
                    <span>{table}</span>
                    <span className="font-medium text-slate-900">{count}</span>
                  </div>
                ))}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={restoring || nonZeroCounts.length === 0} onClick={confirmRestore} className="btn btn-primary">
                {restoring ? 'Restoring…' : 'Confirm Restore'}
              </button>
              <button type="button" disabled={restoring} onClick={() => setPreview(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-card p-6 space-y-2">
        <div className="text-sm font-medium text-slate-900">Google Drive sync</div>
        <p className="text-sm text-slate-500">Not connected yet — Google Drive backup sync is being set up and will appear here once configured.</p>
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
      case 'tax':
        return <TaxTab />
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
