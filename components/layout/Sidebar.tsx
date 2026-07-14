'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { BotRegular, BriefcaseRegular, BuildingRegular, ChevronDownRegular, ChevronRightRegular, FolderOpenRegular, GlobeRegular, GridRegular, MoneyRegular, PeopleRegular, SettingsRegular, ShieldRegular, TaskListSquareLtrRegular } from '@fluentui/react-icons';

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: { label: string; href: string }[]
}

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: GridRegular },
  {
    label: 'Finance',
    icon: MoneyRegular,
    children: [
      { label: 'Dashboard', href: '/finance' },
      { label: 'Chart of Accounts', href: '/finance/chart-of-accounts' },
      { label: 'Journal Entries', href: '/finance/journal-entries' },
      { label: 'Bank Accounts', href: '/finance/bank-accounts' },
      { label: 'Transfers', href: '/finance/transfers' },
      { label: 'Customers', href: '/finance/customers' },
      { label: 'Suppliers', href: '/finance/suppliers' },
      { label: 'Sales Invoices', href: '/finance/sales-invoices' },
      { label: 'Purchase Invoices', href: '/finance/purchase-invoices' },
      { label: 'Payments', href: '/finance/payments' },
      { label: 'Receipts', href: '/finance/receipts' },
      { label: 'Fixed Assets', href: '/finance/fixed-assets' },
      { label: 'Inventory', href: '/finance/inventory' },
      { label: 'Bank Reconciliations', href: '/finance/bank-reconciliations' },
      { label: 'Employees', href: '/finance/employees' },
      { label: 'Payroll', href: '/finance/payroll' },
      { label: 'Payslip Items', href: '/finance/payslip-items' },
      { label: 'Finance Reports', href: '/finance/finance-reports' },
      { label: 'Planning', href: '/finance/planning' },
      { label: 'Business Reports', href: '/finance/business-reports' },
      { label: 'Department Reports', href: '/finance/department-reports' },
      { label: 'Exchange Rates', href: '/finance/exchange-rates' },
      { label: 'Employee Accounts', href: '/finance/employee-accounts' },
      { label: 'Lock Dates', href: '/finance/lock-dates' },
    ],
  },
  {
    label: 'Operations',
    icon: BuildingRegular,
    children: [
      { label: 'Overview', href: '/operations' },
      { label: 'Sites', href: '/operations/sites' },
      { label: 'Deployments', href: '/operations/deployments' },
      { label: 'Attendance', href: '/operations/attendance' },
      { label: 'Equipment', href: '/operations/equipment' },
      { label: 'Incidents', href: '/operations/incidents' },
      { label: 'Patrols', href: '/operations/patrols' },
      { label: 'Coverage Requests', href: '/operations/coverage-requests' },
    ],
  },
  {
    label: 'Human Resources',
    icon: PeopleRegular,
    children: [
      { label: 'Overview', href: '/human-resources' },
      { label: 'Employees', href: '/human-resources/employees' },
      { label: 'Payroll', href: '/human-resources/payroll' },
      { label: 'Payslips', href: '/human-resources/payslips' },
      { label: 'Pay Items', href: '/human-resources/payslip-items' },
      { label: 'Leave Management', href: '/human-resources/leave-management' },
    ],
  },
  {
    label: 'Business Dev.',
    icon: BriefcaseRegular,
    children: [
      { label: 'Overview', href: '/business-development' },
      { label: 'Leads', href: '/business-development/leads' },
      { label: 'Quotations', href: '/business-development/quotations' },
      { label: 'Customers', href: '/business-development/customers' },
      { label: 'Client Liaison', href: '/business-development/client-liaison' },
      { label: 'Reports', href: '/business-development/bd-reports' },
    ],
  },
  {
    label: 'Tasks & Requests',
    icon: TaskListSquareLtrRegular,
    children: [
      { label: 'Tasks', href: '/tasks-requests/tasks' },
      { label: 'Requests', href: '/tasks-requests/requests' },
      { label: 'Meetings', href: '/tasks-requests/meetings' },
      { label: 'Calendar', href: '/tasks-requests/calendar' },
    ],
  },
  { label: 'File Manager', href: '/file-manager', icon: FolderOpenRegular },
  { label: 'AI Helpdesk', href: '/ai-helpdesk', icon: BotRegular },
  { label: 'Portals', href: '/external-portals', icon: GlobeRegular },
  {
    label: 'Settings',
    icon: SettingsRegular,
    children: [
      { label: 'Company', href: '/settings/company' },
      { label: 'Users', href: '/settings/users' },
      { label: 'Audit Trail', href: '/settings/audit-trail' },
    ],
  },
]

// Purely visual grouping — maps existing nav item labels into section headers.
// Does not affect ROLE_NAV_ACCESS, hrefs, or which items render; only which
// header they render under.
const SECTIONS: { title: string; items: string[] }[] = [
  { title: 'MAIN', items: ['Dashboard', 'Tasks & Requests', 'File Manager'] },
  { title: 'OPERATIONS', items: ['Operations'] },
  { title: 'BUSINESS', items: ['Finance', 'Business Dev.'] },
  { title: 'PEOPLE', items: ['Human Resources'] },
  { title: 'INTELLIGENCE', items: ['AI Helpdesk'] },
  { title: 'SYSTEM', items: ['Settings', 'Portals'] },
]

const ROLE_NAV_ACCESS: Record<string, string[]> = {
  SUPER_ADMIN:          ['Finance', 'Operations', 'Human Resources', 'Business Dev.', 'Tasks & Requests', 'File Manager', 'AI Helpdesk', 'Portals', 'Settings'],
  ADMIN:                ['Finance', 'Operations', 'Human Resources', 'Business Dev.', 'Tasks & Requests', 'File Manager', 'AI Helpdesk', 'Portals', 'Settings'],
  FINANCE_MANAGER:      ['Finance', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  OPERATIONS_MANAGER:   ['Operations', 'Human Resources', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  HR_MANAGER:           ['Human Resources', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  BD_MANAGER:           ['Business Dev.', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  GUARD:                ['Tasks & Requests', 'File Manager'],
  STAFF:                ['Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  READ_ONLY:            [],
  CLIENT:               [],
}

export function Sidebar({ role = 'READ_ONLY', onClose }: { role?: string; onClose?: () => void }) {
  const pathname = usePathname()
  const allowedGroups = ROLE_NAV_ACCESS[role] ?? []

  const filteredNav = nav.filter(item =>
    item.href === '/dashboard' || allowedGroups.includes(item.label)
  )
  const navByLabel = new Map(filteredNav.map((item) => [item.label, item]))

  const [open, setOpen] = useState<string[]>(() =>
    filteredNav
      .filter((item) => item.children?.some((c) => pathname.startsWith(c.href)))
      .map((item) => item.label)
  )

  function toggleSection(label: string) {
    setOpen((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  }

  function renderItem(item: NavItem) {
    const Icon = item.icon

    if (item.href) {
      const active = isActive(item.href)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClose}
          className={cn(
            'group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-in-out',
            active
              ? 'bg-primary/15 text-white font-semibold'
              : 'text-white/60 font-medium hover:bg-white/[0.06] hover:text-white/90'
          )}
        >
          {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
          <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-primary' : 'text-white/40 group-hover:text-white/70')} />
          {item.label}
        </Link>
      )
    }

    const isOpen = open.includes(item.label)
    const hasActive = item.children?.some((c) => isActive(c.href)) ?? false

    return (
      <div key={item.label}>
        <button
          onClick={() => toggleSection(item.label)}
          className={cn(
            'group relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-in-out',
            hasActive
              ? 'bg-white/[0.06] text-white font-semibold'
              : 'text-white/60 font-medium hover:bg-white/[0.06] hover:text-white/90'
          )}
        >
          {hasActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
          <Icon className={cn('h-4 w-4 flex-shrink-0', hasActive ? 'text-primary' : 'text-white/40 group-hover:text-white/70')} />
          <span className="flex-1 text-left">{item.label}</span>
          <span className="text-white/30">
            {isOpen
              ? <ChevronDownRegular className="h-3 w-3" />
              : <ChevronRightRegular className="h-3 w-3" />}
          </span>
        </button>

        {isOpen && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-white/[0.08] pl-3">
            {item.children?.map((child) => {
              const childActive = isActive(child.href)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onClose}
                  className={cn(
                    'relative block px-3 py-1.5 rounded-md text-xs transition-all duration-200 ease-in-out',
                    childActive
                      ? 'bg-primary/15 text-white font-semibold'
                      : 'text-white/45 font-medium hover:text-white/90 hover:bg-white/[0.05]'
                  )}
                >
                  {childActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" />}
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-64 flex-shrink-0 bg-brand-navy">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-xl flex-shrink-0">
          <ShieldRegular className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-none tracking-tight">Ravenshield</p>
          <p className="text-[11px] text-white/40 mt-0.5 font-medium">Security ERP</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4 scrollbar-hide">
        {SECTIONS.map((section) => {
          const items = section.items
            .map((label) => navByLabel.get(label))
            .filter((item): item is NavItem => Boolean(item))

          if (items.length === 0) return null

          return (
            <div key={section.title}>
              <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {items.map(renderItem)}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/[0.06] flex-shrink-0">
        <p className="text-[10px] text-white/20 font-medium text-center uppercase tracking-widest">
          Ravenshield ERP &bull; v2.0
        </p>
      </div>
    </div>
  )
}
