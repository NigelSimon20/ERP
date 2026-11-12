import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { AttendanceStatus, ShiftType } from '@prisma/client'
import { z } from 'zod'
import { apiError } from '@/lib/api-error'
import { logAudit } from '@/lib/audit'
import { hoursForStatus, attendanceRate, NOT_ROSTERED_STATUSES } from '@/lib/attendance-hours'

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
  const notRostered = records.filter((r) => (NOT_ROSTERED_STATUSES as readonly string[]).includes(r.status)).length

  return NextResponse.json({
    records,
    summary: { total, present, absent, attendanceRate: attendanceRate(present, total, notRostered) },
  })
}

// A9.4: attendance input is validated (an invalid date reached Prisma as a
// 500), and the guard and site must belong to the session's company (they
// were never checked, so any company's guard could be written to).
const validDate = (label: string) => z.string({ error: `${label} is required` }).refine((v) => !isNaN(new Date(v).getTime()), `${label} is not a valid date`)
const optionalDate = (label: string) => validDate(label).optional().nullable().or(z.literal(''))
const recordSchema = z.object({
  guardId: z.string({ error: 'Guard is required' }).min(1, 'Guard is required'),
  siteId: z.string().min(1).optional().nullable().or(z.literal('')),
  date: validDate('Date'),
  checkIn: optionalDate('Check-in'),
  checkOut: optionalDate('Check-out'),
  status: z.nativeEnum(AttendanceStatus).default('PRESENT'),
  shift: z.nativeEnum(ShiftType).optional().nullable().or(z.literal('')),
  notes: z.string().max(2000).optional().nullable(),
  overtimeHours: z.coerce.number().min(0).max(24).optional().nullable(),
})
type AttendanceInput = z.infer<typeof recordSchema>

async function checkOwnership(companyId: string, recs: AttendanceInput[]): Promise<string | null> {
  const guardIds = Array.from(new Set(recs.map((r) => r.guardId)))
  const siteIds = Array.from(new Set(recs.map((r) => r.siteId).filter((v): v is string => !!v)))
  const [guards, sites] = await Promise.all([
    prisma.guard.count({ where: { companyId, id: { in: guardIds } } }),
    siteIds.length ? prisma.site.count({ where: { companyId, id: { in: siteIds } } }) : 0,
  ])
  if (guards !== guardIds.length) return 'Guard not found'
  if (sites !== siteIds.length) return 'Site not found'
  return null
}

function writeData(r: AttendanceInput) {
  return {
    siteId: r.siteId || null,
    checkIn: r.checkIn ? new Date(r.checkIn) : null,
    checkOut: r.checkOut ? new Date(r.checkOut) : null,
    hoursWorked: hoursForStatus(r.status),
    overtimeHours: r.overtimeHours ?? 0,
    status: r.status,
    shift: r.shift || null,
    notes: r.notes || null,
  }
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const body = await req.json().catch(() => null)

  if (action === 'bulk') {
    const records = body?.records
    if (!Array.isArray(records)) return NextResponse.json({ error: 'records array required', code: 'VALIDATION_ERROR' }, { status: 400 })

    const results: { success: number; errors: string[] } = { success: 0, errors: [] }
    const valid: AttendanceInput[] = []
    records.forEach((rec: unknown, i: number) => {
      const parsed = recordSchema.safeParse(rec)
      if (parsed.success) valid.push(parsed.data)
      else results.errors.push(`Row ${i + 1}: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
    })
    const ownership = valid.length ? await checkOwnership(companyId, valid) : null
    if (ownership) return NextResponse.json({ error: ownership, code: 'NOT_FOUND' }, { status: 404 })

    for (const rec of valid) {
      try {
        const date = new Date(rec.date)
        await prisma.attendance.upsert({
          where: { guardId_date: { guardId: rec.guardId, date } },
          update: writeData(rec),
          create: { id: crypto.randomUUID(), guardId: rec.guardId, date, ...writeData(rec) },
        })
        results.success++
      } catch (e) {
        console.error('[attendance bulk] row failed', e)
        results.errors.push(`Could not save the record for ${rec.date}`)
      }
    }

    await logAudit({ companyId, userId, userName, action: 'UPDATE', module: 'AttendanceRecord', recordId: 'bulk', newValues: { count: results.success } })

    return NextResponse.json(results)
  }

  const parsed = recordSchema.safeParse(body)
  if (!parsed.success) return apiError(parsed.error)
  const rec = parsed.data
  const ownership = await checkOwnership(companyId, [rec])
  if (ownership) return NextResponse.json({ error: ownership, code: 'NOT_FOUND' }, { status: 404 })

  const date = new Date(rec.date)
  const existing = await prisma.attendance.findUnique({ where: { guardId_date: { guardId: rec.guardId, date } } })

  const record = await prisma.attendance.upsert({
    where: { guardId_date: { guardId: rec.guardId, date } },
    update: writeData(rec),
    create: { id: crypto.randomUUID(), guardId: rec.guardId, date, ...writeData(rec) },
  })

  await logAudit({ companyId, userId, userName, action: existing ? 'UPDATE' : 'CREATE', module: 'AttendanceRecord', recordId: record.id, newValues: record })

  return NextResponse.json({ record }, { status: existing ? 200 : 201 })
}
