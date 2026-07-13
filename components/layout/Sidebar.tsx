'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FaShieldAlt, FaDollarSign, FaUsers, FaBriefcase, FaCheckSquare, FaCog, FaFolderOpen, FaRobot, FaGlobe, FaBuilding, FaChevronDown, FaChevronRight } from 'react-icons/fa'
import { MdDashboard } from 'react-icons/md'
import { useState } from 'react'

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  children?: { label: string; href: string }[]
}

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: MdDashboard },
  {
    label: 'Finance',
    icon: FaDollarSign,
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
    icon: FaBuilding,
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
    icon: FaUsers,
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
    icon: FaBriefcase,
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
    icon: FaCheckSquare,
    children: [
      { label: 'Tasks', href: '/tasks-requests/tasks' },
      { label: 'Requests', href: '/tasks-requests/requests' },
      { label: 'Meetings', href: '/tasks-requests/meetings' },
      { label: 'Calendar', href: '/tasks-requests/calendar' },
    ],
  },
  { label: 'File Manager', href: '/file-manager', icon: FaFolderOpen },
  { label: 'AI Helpdesk', href: '/ai-helpdesk', icon: FaRobot },
  { label: 'Portals', href: '/external-portals', icon: FaGlobe },
  {
    label: 'Settings',
    icon: FaCog,
    children: [
      { label: 'Company', href: '/settings/company' },
      { label: 'Users', href: '/settings/users' },
      { label: 'Audit Trail', href: '/settings/audit-trail' },
    ],
  },
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

  return (
    <div className="flex flex-col h-full w-64 flex-shrink-0 bg-[#111827]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center justify-center w-8 h-8 bg-[#E74C5B] rounded-xl flex-shrink-0">
          <FaShieldAlt className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-none tracking-tight">Ravenshield</p>
          <p className="text-[11px] text-white/40 mt-0.5 font-medium">Security ERP</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 scrollbar-hide">
        {filteredNav.map((item) => {
          const Icon = item.icon
          if (item.href) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive(item.href)
                    ? 'bg-[#E74C5B] text-white shadow-sm'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            )
          }

          const isOpen = open.includes(item.label)
          const hasActive = item.children?.some((c) => isActive(c.href))

          return (
            <div key={item.label}>
              <button
                onClick={() => toggleSection(item.label)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  hasActive
                    ? 'text-white/90 bg-white/[0.08]'
                    : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <span className="text-white/30">
                  {isOpen
                    ? <FaChevronDown className="h-3 w-3" />
                    : <FaChevronRight className="h-3 w-3" />}
                </span>
              </button>

              {isOpen && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-white/[0.07] pl-3">
                  {item.children?.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onClose}
                      className={cn(
                        'block px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
                        isActive(child.href)
                          ? 'bg-[#E74C5B] text-white'
                          : 'text-white/45 hover:text-white/90 hover:bg-white/[0.05]'
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
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
