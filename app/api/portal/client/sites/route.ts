import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getClientSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.customerId) return NextResponse.json({ sites: [] })

  const sites = await prisma.site.findMany({
    where: { customer_id: session.customerId, companyId: session.companyId },
    select: {
      id: true,
      site_name: true,
      address: true,
      status: true,
      day_shift_required: true,
      night_shift_required: true,
    },
  })

  return NextResponse.json({
    sites: sites.map(s => ({
      id: s.id,
      name: s.site_name ?? 'Unnamed site',
      address: s.address ?? '',
      status: s.status ?? 'ACTIVE',
      guardsRequired: (s.day_shift_required ?? 0) + (s.night_shift_required ?? 0),
    })),
  })
}
