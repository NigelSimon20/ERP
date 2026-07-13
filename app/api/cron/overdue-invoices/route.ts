import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const overdueInvoices = await prisma.salesInvoice.findMany({
    where: {
      status: { in: ['UNPAID', 'PARTIAL'] },
      due_date: { lt: today.toISOString().split('T')[0] },
    },
  })

  if (overdueInvoices.length === 0) return NextResponse.json({ updated: 0 })

  // Update statuses to OVERDUE
  await prisma.salesInvoice.updateMany({
    where: { id: { in: overdueInvoices.map((i) => i.id) } },
    data: { status: 'OVERDUE' },
  })

  return NextResponse.json({ updated: overdueInvoices.length })
}
