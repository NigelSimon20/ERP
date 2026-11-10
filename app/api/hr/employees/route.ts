import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextEmployeeNumber, nextForceNumber } from '@/lib/auto-numbers'
import { paginate, pageLimit } from '@/lib/utils'
import { toGuardDto, splitName } from '@/lib/guards'
import { employeeProblems, nationalIdTaken } from '@/lib/employee-rules'

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const department = searchParams.get('department')
  const search = searchParams.get('search')
  const page = Number(searchParams.get('page') ?? 1)
  const { skip, take } = paginate(page, pageLimit(searchParams))

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

  const [guards, total, headcount, active] = await Promise.all([
    prisma.guard.findMany({ where: where as any, orderBy: [{ employee_code: 'asc' }, { id: 'asc' }], skip, take }),
    prisma.guard.count({ where: where as any }),
    prisma.guard.count({ where: { companyId } }),
    prisma.guard.aggregate({ where: { companyId, status: 'Active' }, _count: { _all: true }, _avg: { daily_rate: true } }),
  ])

  // P1-7 (BUG-015): the HR overview read these off page 1 ("10 active of 25"
  // when the company had 198 of 312); they are company-wide counts.
  const summary = {
    totalHeadcount: headcount,
    totalActive: active._count._all,
    avgDailyRate: Number(active._avg.daily_rate ?? 0),
  }

  return NextResponse.json({ guards: guards.map(toGuardDto), total, page, pages: Math.ceil(total / take), summary })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { name, idNumber, phone, whatsapp, email, address, department, position, rank, dailyRate, basicSalary, status, dateOfBirth, dateHired } = body

  const problems = employeeProblems({ name: name ?? '', dateOfBirth, hireDate: dateHired, dailyRate, basicSalary })
  if (problems.length) {
    return NextResponse.json({ error: problems[0].message, code: 'VALIDATION_ERROR', fields: Object.fromEntries(problems.map((p) => [p.field, p.message])) }, { status: 400 })
  }
  if (idNumber && await nationalIdTaken(prisma, companyId, idNumber)) {
    return NextResponse.json({ error: 'Another employee already has this national ID', code: 'DUPLICATE_NATIONAL_ID' }, { status: 409 })
  }

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
      full_name: String(name).trim(),
      first_name,
      last_name,
      national_id: idNumber || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      email: email || null,
      address: address || null,
      department: department || null,
      position: position || null,
      employee_type: rank || null,
      daily_rate: dailyRate != null ? Number(dailyRate) : null,
      basic_salary: basicSalary != null ? Number(basicSalary) : null,
      date_of_birth: dateOfBirth || null,
      hire_date: dateHired || null,
      status: status || 'Active',
    },
  })

  await logAudit({ companyId, userId, userName: session.name, action: 'CREATE', module: 'Guard', recordId: guard.id, newValues: guard })
  return NextResponse.json({ guard: toGuardDto(guard) }, { status: 201 })
}
