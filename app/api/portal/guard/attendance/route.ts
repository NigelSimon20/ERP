import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGuardSession } from '@/lib/portal-auth'

export async function GET() {
  const session = await getGuardSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.guardId) return NextResponse.json({ attendance: [] })

  const records = await prisma.attendance.findMany({
    where: { guardId: session.guardId },
    orderBy: { date: 'desc' },
    take: 90,
    select: { id: true, date: true, checkIn: true, checkOut: true, hoursWorked: true, status: true },
  })

  return NextResponse.json({
    attendance: records.map(a => ({
      id: a.id,
      date: a.date.toISOString(),
      checkIn: a.checkIn ? a.checkIn.toISOString() : null,
      checkOut: a.checkOut ? a.checkOut.toISOString() : null,
      hoursWorked: Number(a.hoursWorked),
      status: a.status,
    })),
  })
}
