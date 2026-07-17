import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getClientSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.customerId) return NextResponse.json({ receipts: [] })

  const receipts = await prisma.payment.findMany({
    where: { companyId: session.companyId, customer_id: session.customerId, payment_type: 'Customer Receipt' },
    orderBy: { payment_date: 'desc' },
    select: { id: true, payment_number: true, payment_date: true, amount: true, description: true },
  })

  return NextResponse.json({
    receipts: receipts.map(r => ({
      id: r.id,
      reference: r.payment_number,
      receiptDate: r.payment_date,
      amount: Number(r.amount),
      notes: r.description,
    })),
  })
}
