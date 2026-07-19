import { prisma } from './prisma'
import { PortalCategory } from '@prisma/client'
import crypto from 'crypto'

export const ROLE_OPTIONS = [
  'SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'OPERATIONS_MANAGER', 'HR_MANAGER',
  'BD_MANAGER', 'STAFF', 'GUARD', 'CLIENT', 'READ_ONLY',
]

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  FINANCE_MANAGER: 'Finance Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  HR_MANAGER: 'HR Manager',
  BD_MANAGER: 'Business Dev. Manager',
  STAFF: 'Staff',
  GUARD: 'Guard',
  CLIENT: 'Client',
  READ_ONLY: 'Read Only',
}

export const CATEGORY_OPTIONS = [
  'INTERNAL', 'EXTERNAL', 'GOVERNMENT', 'BANKING', 'TELECOMMUNICATIONS',
  'UTILITIES', 'HR', 'FINANCE', 'OPERATIONS', 'COMPLIANCE',
]

export const CATEGORY_LABELS: Record<string, string> = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  GOVERNMENT: 'Government',
  BANKING: 'Banking',
  TELECOMMUNICATIONS: 'Telecommunications',
  UTILITIES: 'Utilities',
  HR: 'HR',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  COMPLIANCE: 'Compliance',
}

export const CATEGORY_BADGE: Record<string, string> = {
  INTERNAL: 'bg-muted text-muted-foreground',
  EXTERNAL: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  GOVERNMENT: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  BANKING: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  TELECOMMUNICATIONS: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  UTILITIES: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  HR: 'bg-brand-navy text-white',
  FINANCE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  OPERATIONS: 'bg-foreground text-background',
  COMPLIANCE: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export const OPEN_BEHAVIOR_LABELS: Record<string, string> = {
  NEW_TAB: 'New Tab',
  SAME_TAB: 'Same Tab',
  EMBEDDED: 'Embedded View',
}

/**
 * Lazily seeds the four built-in portals for a company the first time it has
 * none — Client Portal and Guard Portal reuse the app's existing internal
 * routes (isSystem: true, undeletable), ZIMRA TaRMS and the ISP self-care
 * portal are pre-configured convenience rows an admin can freely edit or
 * delete. Runs on every GET /api/portals; the count check makes it a no-op
 * once seeded.
 */
export async function ensureDefaultPortals(companyId: string): Promise<void> {
  const existing = await prisma.portal.count({ where: { companyId } })
  if (existing > 0) return

  const defaults: Array<{
    slug: string
    name: string
    category: PortalCategory
    description: string
    url: string
    logoUrl?: string
    icon: string
    colorPrimary: string
    colorSecondary?: string
    buttonText: string
    isSystem: boolean
    displayOrder: number
    roles: string[]
  }> = [
    {
      slug: 'client-portal',
      name: 'Client Portal',
      category: 'INTERNAL',
      description: 'Clients access their invoices, payment history, active site deployments, and incident reports — securely.',
      url: '/portal/client',
      icon: 'Building',
      colorPrimary: '#111827',
      buttonText: 'Open Client Portal',
      isSystem: true,
      displayOrder: 0,
      roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER', 'BD_MANAGER', 'CLIENT'],
    },
    {
      slug: 'guard-portal',
      name: 'Guard Self-Service',
      category: 'INTERNAL',
      description: 'Guards view their deployment schedule, attendance records, and download payslips.',
      url: '/portal/guard',
      icon: 'Shield',
      colorPrimary: '#DC2626',
      buttonText: 'Open Guard Portal',
      isSystem: true,
      displayOrder: 1,
      roles: ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'OPERATIONS_MANAGER', 'GUARD'],
    },
    {
      slug: 'zimra-tarms',
      name: 'ZIMRA TaRMS',
      category: 'GOVERNMENT',
      description: 'Access the Zimbabwe Revenue Authority Tax and Revenue Management System (TaRMS) for tax returns, VAT, PAYE, corporate tax, and other statutory obligations.',
      url: 'https://mytaxselfservice.zimra.co.zw/',
      logoUrl: '/portal-logos/zimra.png',
      icon: 'Bank',
      colorPrimary: '#1E7A34',
      colorSecondary: '#1A1A1A',
      buttonText: 'Open TaRMS Portal',
      isSystem: false,
      displayOrder: 2,
      roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'],
    },
    {
      slug: 'isp-liquid-home',
      name: 'Liquid Home Zimbabwe',
      category: 'TELECOMMUNICATIONS',
      description: 'Access your Internet Service Provider portal to manage connectivity, bandwidth usage, invoices, subscriptions, and support requests.',
      url: 'https://zw.myliquidhome.tech/',
      logoUrl: '/portal-logos/liquid.png',
      icon: 'Wifi',
      colorPrimary: '#F9AA3E',
      buttonText: 'Open ISP Portal',
      isSystem: false,
      displayOrder: 3,
      roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'],
    },
  ]

  await prisma.$transaction(
    defaults.map((d) =>
      prisma.portal.create({
        data: {
          id: crypto.randomUUID(),
          companyId,
          slug: d.slug,
          name: d.name,
          category: d.category,
          description: d.description,
          url: d.url,
          logoUrl: d.logoUrl ?? null,
          icon: d.icon,
          colorPrimary: d.colorPrimary,
          colorSecondary: d.colorSecondary ?? null,
          buttonText: d.buttonText,
          isSystem: d.isSystem,
          displayOrder: d.displayOrder,
          roleAccess: {
            create: d.roles.map((role) => ({ id: crypto.randomUUID(), role })),
          },
        },
      }),
    ),
  )
}
