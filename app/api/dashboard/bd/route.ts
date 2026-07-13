import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'

function monthKey(d: Date | string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'BD_MANAGER'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = session
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [
    totalLeads, activeLeads, wonThisMonth, lostThisMonth,
    allActiveLeads, pendingQuotations, totalAccepted, totalQuotes,
    totalCustomers, contractValueAgg,
    leadsPerStage, recentLeads, quotationsDueSoon,
    wonByMonth,
  ] = await Promise.all([
    prisma.lead.count({ where: { companyId } }),
    prisma.lead.count({ where: { companyId, status: { notIn: ['WON', 'LOST'] } } }),
    prisma.lead.count({ where: { companyId, status: 'WON', updatedAt: { gte: monthStart } } }),
    prisma.lead.count({ where: { companyId, status: 'LOST', updatedAt: { gte: monthStart } } }),
    prisma.lead.findMany({ where: { companyId, status: { notIn: ['WON', 'LOST'] } }, select: { estimatedValue: true, probability: true } }),
    prisma.quotation.count({ where: { companyId, status: { in: ['DRAFT', 'SENT'] } } }),
    prisma.quotation.count({ where: { companyId, status: 'ACCEPTED' } }),
    prisma.quotation.count({ where: { companyId } }),
    prisma.customer.count({}),
    prisma.site.count({ where: { status: 'ACTIVE' } }),
    prisma.lead.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
    prisma.lead.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, companyName: true, contactName: true, estimatedValue: true, status: true, createdAt: true } }),
    prisma.quotation.findMany({
      where: { companyId, validUntil: { lte: sevenDaysOut, gte: now }, status: 'SENT' },
      orderBy: { validUntil: 'asc' },
      take: 10,
      select: { quoteNumber: true, customerId: true, total: true, validUntil: true },
    }),
    prisma.lead.findMany({ where: { companyId, status: 'WON', updatedAt: { gte: sixMonthsAgo } }, select: { updatedAt: true } }),
  ])

  const pipelineValue = allActiveLeads.reduce((sum, l) => sum + Number(l.estimatedValue) * (l.probability / 100), 0)
  const quoteConversionRate = totalQuotes > 0 ? Math.round((totalAccepted / totalQuotes) * 100) : 0

  // Won trend — group by month
  const wonTrendBuckets: { month: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    wonTrendBuckets.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), count: 0 })
  }
  wonByMonth.forEach(w => {
    const key = monthKey(w.updatedAt)
    const b = wonTrendBuckets.find(b => b.month === key)
    if (b) b.count++
  })

  const customerIds = Array.from(new Set(quotationsDueSoon.map(q => q.customerId).filter(Boolean) as string[]))
  const customers = await prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, company_name: true } })
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c.company_name ?? 'Unknown']))

  return NextResponse.json({
    totalLeads,
    activeLeads,
    wonThisMonth,
    lostThisMonth,
    pipelineValue,
    pendingQuotations,
    quoteConversionRate,
    totalCustomers,
    totalContractValue: 0, // Site model lacks aggregatable contractValue field
    leadsPerStage:  leadsPerStage.map(g => ({ status: g.status, count: g._count._all })),
    wonTrend:       wonTrendBuckets,
    recentLeads:    recentLeads.map(l => ({ ...l, estimatedValue: Number(l.estimatedValue), createdAt: l.createdAt.toISOString() })),
    quotationsDueSoon: quotationsDueSoon.map(q => ({
      quoteNumber:  q.quoteNumber,
      customerName: customerMap[q.customerId ?? ''] ?? 'Direct',
      total:        Number(q.total),
      validUntil:   q.validUntil.toISOString(),
    })),
    revenueByCustomer: [], // Customer model lacks companyId field; unavailable
  })
}
