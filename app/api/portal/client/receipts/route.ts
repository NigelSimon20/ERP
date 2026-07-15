import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getClientSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.customerId) return NextResponse.json({ receipts: [] })

  const receipts = await prisma.receipt.findMany({
    where: { companyId: session.companyId, customerId: session.customerId },
    orderBy: { receiptDate: 'desc' },
    select: { id: true, reference: true, receiptDate: true, amount: true, notes: true },
  })

  return NextResponse.json({
    receipts: receipts.map(r => ({
      id: r.id,
      reference: r.reference,
      receiptDate: r.receiptDate.toISOString(),
      amount: Number(r.amount),
      notes: r.notes,
    })),
  })
}
