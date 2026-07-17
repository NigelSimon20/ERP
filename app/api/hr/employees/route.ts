import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextEmployeeNumber, nextForceNumber } from '@/lib/auto-numbers'
import { paginate } from '@/lib/utils'
import { toGuardDto, splitName } from '@/lib/guards'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const department = searchParams.get('department')
  const search = searchParams.get('search')
  const page = Number(searchParams.get('page') ?? 1)
  const { skip, take } = paginate(page)

  const where: any = {
    companyId,
    ...(status ? { status } : {}),
    ...(department ? { department } : {}),
    ...(search ? {
      OR: [
        { full_name: { contains: search, mode: 'insensitive' as const } },
        { first_name: { contains: search, mode: 'insensitive' as const } },
        { employee_code: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  }

  const [guards, total] = await Promise.all([
    prisma.guard.findMany({ where: where as any, orderBy: { employee_code: 'asc' }, skip, take }),
    prisma.guard.count({ where: where as any }),
  ])

  return NextResponse.json({ guards: guards.map(toGuardDto), total, page, pages: Math.ceil(total / take) })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { name, idNumber, phone, email, address, department, position, rank, dailyRate, status, dateOfBirth, dateHired } = body

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const [employeeNumber, forceNumber] = await Promise.all([
    nextEmployeeNumber(companyId),
    nextForceNumber(companyId),
  ])

  const { first_name, last_name } = splitName(name)

  const guard = await prisma.guard.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      employee_code: employeeNumber,
      force_number: forceNumber,
      full_name: name,
      first_name,
      last_name,
      national_id: idNumber || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      department: department || null,
      position: position || null,
      employee_type: rank || null,
      daily_rate: dailyRate != null ? Number(dailyRate) : null,
      date_of_birth: dateOfBirth || null,
      hire_date: dateHired || null,
      status: status || 'Active',
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'Guard', recordId: guard.id, newValues: guard })
  return NextResponse.json({ guard: toGuardDto(guard) }, { status: 201 })
}
