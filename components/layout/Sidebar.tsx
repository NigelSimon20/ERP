'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { BotRegular, BriefcaseRegular, BuildingRegular, ChatRegular, ChevronRightRegular, FolderOpenRegular, GlobeRegular, GridRegular, MoneyRegular, PanelLeftContractRegular, PanelLeftExpandRegular, PeopleRegular, SettingsRegular, TaskListSquareLtrRegular } from '@fluentui/react-icons';

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: { label: string; href: string }[]
}

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: GridRegular },
  { label: 'Messages', href: '/messages', icon: ChatRegular },
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
      { label: 'Occurrence Book', href: '/operations/occurrence-book' },
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
      { label: 'Import Logs', href: '/settings/import-logs' },
    ],
  },
]

// Purely visual grouping — maps existing nav item labels into section headers.
// Does not affect ROLE_NAV_ACCESS, hrefs, or which items render; only which
// header they render under.
const SECTIONS: { title: string; items: string[] }[] = [
  { title: 'MAIN', items: ['Dashboard', 'Messages', 'Tasks & Requests', 'File Manager'] },
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
  OPERATIONS_MANAGER:   ['Operations', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  HR_MANAGER:           ['Human Resources', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  BD_MANAGER:           ['Business Dev.', 'Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  GUARD:                ['Tasks & Requests', 'File Manager'],
  STAFF:                ['Tasks & Requests', 'File Manager', 'AI Helpdesk'],
  READ_ONLY:            [],
  CLIENT:               [],
}

const SIDEBAR_COLLAPSED_KEY = 'ravenshield-sidebar-collapsed'

export function Sidebar({ role = 'READ_ONLY', onClose, collapsible = true }: { role?: string; onClose?: () => void; collapsible?: boolean }) {
  const pathname = usePathname()
  const allowedGroups = ROLE_NAV_ACCESS[role] ?? []

  const filteredNav = nav.filter(item =>
    item.href === '/dashboard' || item.href === '/messages' || allowedGroups.includes(item.label)
  )
  const navByLabel = new Map(filteredNav.map((item) => [item.label, item]))

  const [open, setOpen] = useState<string[]>(() =>
    filteredNav
      .filter((item) => item.children?.some((c) => pathname.startsWith(c.href)))
      .map((item) => item.label)
  )

  const [collapsed, setCollapsed] = useState(false)
  const isCollapsed = collapsible && collapsed

  useEffect(() => {
    if (!collapsible) return
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true')
  }, [collapsible])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  function toggleSection(label: string) {
    setOpen((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  }

  const hoverBg = 'hover:bg-[#FFF5F5] dark:hover:bg-primary/10'

  function renderItem(item: NavItem) {
    const Icon = item.icon

    if (item.href) {
      const active = isActive(item.href)

      if (isCollapsed) {
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            title={item.label}
            className={cn(
              'relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-all duration-200 ease-in-out',
              active ? 'bg-primary/10' : hoverBg
            )}
          >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
            <Icon className={cn('h-[18px] w-[18px]', active ? 'text-primary' : 'text-muted-foreground')} />
          </Link>
        )
      }

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClose}
          className={cn(
            'group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-in-out',
            active
              ? 'bg-primary/10 text-foreground font-semibold'
              : cn('text-muted-foreground font-medium hover:text-foreground', hoverBg)
          )}
        >
          {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
          <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-primary' : 'text-muted-foreground/80 group-hover:text-primary')} />
          {item.label}
        </Link>
      )
    }

    const isOpen = open.includes(item.label)
    const hasActive = item.children?.some((c) => isActive(c.href)) ?? false

    if (isCollapsed) {
      return (
        <div key={item.label} className="relative group">
          <button
            type="button"
            title={item.label}
            className={cn(
              'relative flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-all duration-200 ease-in-out',
              hasActive ? 'bg-primary/10' : hoverBg
            )}
          >
            {hasActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
            <Icon className={cn('h-[18px] w-[18px]', hasActive ? 'text-primary' : 'text-muted-foreground')} />
          </button>

          <div className="invisible opacity-0 translate-x-1 group-hover:visible group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:visible group-focus-within:opacity-100 group-focus-within:translate-x-0 absolute left-full top-0 ml-2 w-56 rounded-lg border border-border bg-card p-2 shadow-lg transition-all duration-150 ease-in-out z-50">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</p>
            <div className="mt-1 space-y-0.5">
              {item.children?.map((child) => {
                const childActive = isActive(child.href)
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={onClose}
                    className={cn(
                      'block px-3 py-1.5 rounded-md text-xs transition-colors duration-150',
                      childActive ? 'bg-primary/10 text-primary font-semibold' : cn('text-muted-foreground hover:text-foreground', hoverBg)
                    )}
                  >
                    {child.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div key={item.label}>
        <button
          onClick={() => toggleSection(item.label)}
          className={cn(
            'group relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-sm transition-all duration-200 ease-in-out',
            hasActive
              ? 'bg-primary/10 text-foreground font-semibold'
              : cn('text-muted-foreground font-medium hover:text-foreground', hoverBg)
          )}
        >
          {hasActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-primary" />}
          <Icon className={cn('h-4 w-4 flex-shrink-0', hasActive ? 'text-primary' : 'text-muted-foreground/80 group-hover:text-primary')} />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronRightRegular
            className={cn(
              'h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ease-in-out flex-shrink-0',
              isOpen && 'rotate-90'
            )}
          />
        </button>

        {isOpen && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
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
                      ? 'bg-primary/10 text-primary font-semibold'
                      : cn('text-muted-foreground font-medium hover:text-foreground', hoverBg)
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
    <div
      className={cn(
        'flex flex-col h-full flex-shrink-0 bg-card shadow-[2px_0_10px_-4px_rgba(0,0,0,0.06)] transition-[width] duration-300 ease-in-out',
        isCollapsed ? 'w-[76px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center h-16 flex-shrink-0 border-b border-border/60', isCollapsed ? 'justify-center px-2' : 'gap-3 px-5')}>
        <div className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden">
          <Image src="/assets/raven-logo.jpeg" alt="RavenShield" width={32} height={32} className="object-cover" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="font-bold text-foreground text-sm leading-none tracking-tight">Ravenshield</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">Security ERP</p>
          </div>
        )}
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
              {!isCollapsed && (
                <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map(renderItem)}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border/60 flex-shrink-0 space-y-2">
        {collapsible && (
          <button
            type="button"
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center gap-2 rounded-lg text-muted-foreground transition-all duration-200 ease-in-out py-2 hover:text-primary',
              hoverBg,
              isCollapsed ? 'w-10 h-10 mx-auto justify-center' : 'w-full px-2'
            )}
          >
            {isCollapsed ? <PanelLeftExpandRegular className="h-4 w-4" /> : <PanelLeftContractRegular className="h-4 w-4" />}
            {!isCollapsed && <span className="text-xs font-medium">Collapse</span>}
          </button>
        )}
        {!isCollapsed && (
          <p className="text-[10px] text-muted-foreground/60 font-medium text-center uppercase tracking-widest">
            Ravenshield ERP &bull; v2.0
          </p>
        )}
      </div>
    </div>
  )
}
