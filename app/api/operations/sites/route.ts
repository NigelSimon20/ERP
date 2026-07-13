import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import crypto from 'crypto'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { } = session

  const sites = await prisma.site.findMany({ orderBy: { site_name: 'asc' } })

  return NextResponse.json({
    sites: sites.map((s) => ({
      ...s,
      customerName: s.customer_name ?? null,
      activeDeploymentCount: 0,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { name, customerId, address, guardsRequired, contractValue, contractStart, contractEnd, status, billingRateDay, billingRateNight } = body

  if (!name) return NextResponse.json({ error: 'Site name is required' }, { status: 400 })

  if (contractStart && contractEnd && new Date(contractEnd) <= new Date(contractStart)) {
    return NextResponse.json({ error: 'Contract end date must be after start date' }, { status: 400 })
  }

  const site = await prisma.site.create({
    data: {
      id: crypto.randomUUID(),
      site_name: name,
      customer_id: customerId || null,
      address: address || null,
      day_shift_required: Number(guardsRequired) || 1,
      contract_start_date: contractStart || null,
      contract_end_date: contractEnd || null,
      status: status || 'ACTIVE',
      billing_rate_day: billingRateDay !== undefined ? Number(billingRateDay) : null,
      billing_rate_night: billingRateNight !== undefined ? Number(billingRateNight) : null,
    },
  })

  await logAudit({ companyId, userId, userName, action: 'CREATE', module: 'Site', recordId: site.id, newValues: site })

  return NextResponse.json({ site }, { status: 201 })
}
