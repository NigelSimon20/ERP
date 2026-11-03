import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { hoursForStatus } from '@/lib/attendance-hours'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const siteId = searchParams.get('siteId')
  const region = searchParams.get('region')

  if (month) {
    const [year, monthNum] = month.split('-').map(Number)
    if (!year || !monthNum) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })

    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1))
    const monthEnd = new Date(Date.UTC(year, monthNum, 1))
    const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()

    const guardWhere: Record<string, unknown> = { companyId }
    if (region) guardWhere.region = region
    if (siteId) {
      guardWhere.id = {
        in: (
          await prisma.deployment.findMany({ where: { siteId, status: 'ACTIVE' }, select: { guardId: true } })
        ).map((d) => d.guardId),
      }
    }

    const guards = await prisma.guard.findMany({
      where: guardWhere,
      select: { id: true, force_number: true, full_name: true, region: true },
      orderBy: { force_number: 'asc' },
    })

    const records = await prisma.attendance.findMany({
      where: { guardId: { in: guards.map((g) => g.id) }, date: { gte: monthStart, lt: monthEnd } },
      select: { id: true, guardId: true, date: true, status: true, shift: true, notes: true },
    })

    const regionRows = await prisma.guard.findMany({
      where: { companyId, region: { not: null } },
      select: { region: true },
      distinct: ['region'],
    })

    return NextResponse.json({
      month,
      daysInMonth,
      guards,
      records,
      regions: regionRows.map((r) => r.region).filter(Boolean),
    })
  }

  const date = searchParams.get('date')
  const guardId = searchParams.get('guardId')

  const records = await prisma.attendance.findMany({
    where: {
      ...(date ? { date: new Date(date) } : {}),
      ...(guardId ? { guardId } : {}),
      ...(siteId ? { siteId } : {}),
      guard: { companyId },
    },
    include: {
      guard: { select: { id: true, full_name: true, employee_code: true, force_number: true } },
      site: { select: { id: true, site_name: true } },
    },
    orderBy: [{ date: 'desc' }, { guard: { full_name: 'asc' } }],
  })

  const total = records.length
  const present = records.filter((r) => r.status === 'PRESENT').length
  const absent = records.filter((r) => r.status === 'ABSENT').length

  return NextResponse.json({
    records,
    summary: { total, present, absent, attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0 },
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'bulk') {
    const { records } = await req.json()
    if (!Array.isArray(records)) return NextResponse.json({ error: 'records array required' }, { status: 400 })

    const results: { success: number; errors: string[] } = { success: 0, errors: [] }

    for (const rec of records) {
      try {
        const { guardId, siteId, date, status, shift, notes, overtimeHours } = rec
        if (!guardId || !date) { results.errors.push('Missing guardId or date for record'); continue }

        const hoursWorked = hoursForStatus(status || 'PRESENT')
        const otHours = overtimeHours != null ? Number(overtimeHours) : 0

        await prisma.attendance.upsert({
          where: { guardId_date: { guardId, date: new Date(date) } },
          update: { siteId: siteId || null, status: status || 'PRESENT', shift: shift || null, hoursWorked, overtimeHours: otHours, notes: notes || null },
          create: { id: crypto.randomUUID(), guardId, siteId: siteId || null, date: new Date(date), status: status || 'PRESENT', shift: shift || null, hoursWorked, overtimeHours: otHours, notes: notes || null },
        })
        results.success++
      } catch (e) {
        results.errors.push(`Row error: ${e instanceof Error ? e.message : 'unknown'}`)
      }
    }

    await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'AttendanceRecord', recordId: 'bulk', newValues: { count: results.success } })

    return NextResponse.json(results)
  }

  const body = await req.json()
  const { guardId, siteId, date, checkIn, checkOut, status, shift, notes, overtimeHours } = body

  if (!guardId || !date) return NextResponse.json({ error: 'guardId and date are required' }, { status: 400 })

  const hoursWorked = hoursForStatus(status || 'PRESENT')
  const otHours = overtimeHours != null ? Number(overtimeHours) : 0

  const existing = await prisma.attendance.findUnique({ where: { guardId_date: { guardId, date: new Date(date) } } })

  const record = await prisma.attendance.upsert({
    where: { guardId_date: { guardId, date: new Date(date) } },
    update: { siteId: siteId || null, checkIn: checkIn ? new Date(checkIn) : null, checkOut: checkOut ? new Date(checkOut) : null, hoursWorked, overtimeHours: otHours, status: status || 'PRESENT', shift: shift || null, notes: notes || null },
    create: { id: crypto.randomUUID(), guardId, siteId: siteId || null, date: new Date(date), checkIn: checkIn ? new Date(checkIn) : null, checkOut: checkOut ? new Date(checkOut) : null, hoursWorked, overtimeHours: otHours, status: status || 'PRESENT', shift: shift || null, notes: notes || null },
  })

  await logAudit({ companyId, userId, userName, action: existing ? 'UPDATE' : 'CREATE', module: 'AttendanceRecord', recordId: record.id, newValues: record })

  return NextResponse.json({ record }, { status: existing ? 200 : 201 })
}
