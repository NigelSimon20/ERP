import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { formatCurrency } from '@/lib/utils'
import { isPastDue } from '@/lib/calculations'

const DAY_MS = 86400_000

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// At most one notification (and one WhatsApp message) per user per type per
// calendar day — these are recurring situations (unpaid invoices, expired
// contracts) that should re-remind daily until resolved, not vanish forever
// after a single mention the moment someone marks it read.
async function notifyRoleDigest(params: {
  companyId?: string
  roles: string[]
  type: string
  title: string
  message: string
  link: string
}): Promise<{ notified: number; whatsappSent: number }> {
  const { companyId, roles, type, title, message, link } = params
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, active: true, ...(companyId ? { companyId } : {}) },
    select: { id: true, companyId: true, whatsapp: true },
  })

  let notified = 0
  let whatsappSent = 0
  const todayStart = startOfToday()

  for (const user of users) {
    const already = await prisma.notification.findFirst({
      where: { userId: user.id, type, link, createdAt: { gte: todayStart } },
    })
    if (already) continue

    await prisma.notification.create({
      data: { id: crypto.randomUUID(), userId: user.id, companyId: user.companyId, title, message, type, link, read: false },
    })
    notified++

    if (user.whatsapp) {
      const res = await sendWhatsAppMessage({ to: user.whatsapp, message: `🔔 *${title} — Ravenshield*\n\n${message}` }).catch(() => ({ success: false }))
      if (res.success) whatsappSent++
    }
  }

  return { notified, whatsappSent }
}

export async function runOverdueInvoiceAlerts() {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: ['Sent', 'Partial'] }, due_date: { not: null } },
    select: { id: true, companyId: true, balance_due: true, due_date: true },
  }).then((rows) => rows.filter((i) => i.due_date && isPastDue(i.due_date)))
  const overdue = invoices.filter((i) => Number(i.balance_due ?? 0) > 0)

  const byCompany = new Map<string, typeof overdue>()
  for (const inv of overdue) {
    if (!byCompany.has(inv.companyId)) byCompany.set(inv.companyId, [])
    byCompany.get(inv.companyId)!.push(inv)
  }

  let notified = 0
  let whatsappSent = 0
  for (const [companyId, list] of Array.from(byCompany.entries())) {
    const totalAmount = list.reduce((s, i) => s + Number(i.balance_due ?? 0), 0)
    const title = `${list.length} invoice${list.length === 1 ? '' : 's'} overdue`
    const message = `${list.length} sales invoice${list.length === 1 ? ' is' : 's are'} overdue, totalling ${formatCurrency(totalAmount)}. Review collections in Finance → Sales Invoices.`
    const res = await notifyRoleDigest({ companyId, roles: ['SUPER_ADMIN', 'ADMIN', 'FINANCE_MANAGER'], type: 'PAYMENT', title, message, link: '/finance/sales-invoices' })
    notified += res.notified
    whatsappSent += res.whatsappSent
  }

  return { overdueCount: overdue.length, notified, whatsappSent }
}

export async function runContractExpiryAlerts(windowDays = 30) {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + windowDays * DAY_MS)

  // ── Employee contracts ────────────────────────────────────────────────
  const guards = await prisma.guard.findMany({
    where: { status: 'Active', contract_expiry_date: { not: null } },
    select: { id: true, companyId: true, contract_expiry_date: true },
  })
  const relevantGuards = guards.filter((g) => new Date(g.contract_expiry_date!) <= windowEnd)

  const byCompanyGuards = new Map<string, typeof relevantGuards>()
  for (const g of relevantGuards) {
    if (!byCompanyGuards.has(g.companyId)) byCompanyGuards.set(g.companyId, [])
    byCompanyGuards.get(g.companyId)!.push(g)
  }

  let notified = 0
  let whatsappSent = 0

  for (const [companyId, list] of Array.from(byCompanyGuards.entries())) {
    const expired = list.filter((g) => new Date(g.contract_expiry_date!) < now).length
    const expiringSoon = list.length - expired
    const parts: string[] = []
    if (expired > 0) parts.push(`${expired} already expired`)
    if (expiringSoon > 0) parts.push(`${expiringSoon} expiring within ${windowDays} days`)
    const title = `${list.length} employee contract${list.length === 1 ? '' : 's'} need${list.length === 1 ? 's' : ''} attention`
    const message = `${parts.join(', ')}. Review in Human Resources → Employees.`
    const res = await notifyRoleDigest({ companyId, roles: ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'], type: 'CONTRACT', title, message, link: '/human-resources/employees' })
    notified += res.notified
    whatsappSent += res.whatsappSent
  }

  // ── Site contracts ────────────────────────────────────────────────────
  // Site has no companyId column (unlike Guard/SalesInvoice) — recipients
  // are resolved by role only, matching the single-tenant reality today.
  const sites = await prisma.site.findMany({
    where: { status: 'Active', contract_end_date: { not: null } },
    select: { id: true, contract_end_date: true },
  })
  const relevantSites = sites.filter((s) => new Date(s.contract_end_date!) <= windowEnd)

  if (relevantSites.length > 0) {
    const expired = relevantSites.filter((s) => new Date(s.contract_end_date!) < now).length
    const expiringSoon = relevantSites.length - expired
    const parts: string[] = []
    if (expired > 0) parts.push(`${expired} already expired`)
    if (expiringSoon > 0) parts.push(`${expiringSoon} expiring within ${windowDays} days`)
    const title = `${relevantSites.length} site contract${relevantSites.length === 1 ? '' : 's'} need${relevantSites.length === 1 ? 's' : ''} attention`
    const message = `${parts.join(', ')}. Review in Operations → Sites.`
    const res = await notifyRoleDigest({ roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'], type: 'CONTRACT', title, message, link: '/operations/sites' })
    notified += res.notified
    whatsappSent += res.whatsappSent
  }

  return { guardCount: relevantGuards.length, siteCount: relevantSites.length, notified, whatsappSent }
}

export async function runLowStockAlerts() {
  const items = await prisma.equipment.findMany({
    where: { is_active: true },
    select: { equipment_name: true, quantity_in_stock: true, reorder_level: true },
  })
  const low = items.filter((e) => e.reorder_level != null && e.quantity_in_stock != null && e.quantity_in_stock <= e.reorder_level)

  if (low.length === 0) return { lowStockCount: 0, notified: 0, whatsappSent: 0 }

  const outOfStock = low.filter((e) => (e.quantity_in_stock ?? 0) === 0).length
  const title = `${low.length} equipment item${low.length === 1 ? '' : 's'} at or below reorder level`
  const message = `${low.length} item${low.length === 1 ? '' : 's'} need reordering${outOfStock > 0 ? ` (${outOfStock} completely out of stock)` : ''}. Review in Operations → Equipment.`
  const res = await notifyRoleDigest({ roles: ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'], type: 'STOCK', title, message, link: '/operations/equipment' })

  return { lowStockCount: low.length, notified: res.notified, whatsappSent: res.whatsappSent }
}
