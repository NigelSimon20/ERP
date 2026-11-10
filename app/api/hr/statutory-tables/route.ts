import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { apiError } from '@/lib/api-error'
import { STATUTORY_KINDS, CONFIG_SCHEMAS } from '@/lib/payroll/statutory'

// P1-10: statutory tables are entered from their source document and only
// take effect once a second person approves them ([id]?action=approve).
const createSchema = z.object({
  kind: z.enum(STATUTORY_KINDS),
  currency: z.string().trim().length(3).default('USD'),
  effectiveFrom: z.string().refine((v) => !isNaN(new Date(v).getTime()), 'effectiveFrom is not a valid date'),
  sourceDocument: z.string().trim().min(3, 'Name the source document (e.g. ZIMRA tax tables, SI number)').max(500),
  config: z.unknown(),
})

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tables = await prisma.statutoryTable.findMany({ where: { companyId: session.companyId }, orderBy: [{ kind: 'asc' }, { effectiveFrom: 'desc' }] })
  return NextResponse.json({ tables })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const data = createSchema.parse(await req.json())
    const config = CONFIG_SCHEMAS[data.kind].parse(data.config) as Prisma.InputJsonValue
    const table = await prisma.statutoryTable.create({
      data: {
        companyId: session.companyId, kind: data.kind, currency: data.currency.toUpperCase(),
        effectiveFrom: new Date(data.effectiveFrom), config, sourceDocument: data.sourceDocument,
        status: 'DRAFT', createdBy: session.userId,
      },
    })
    await logAudit({ companyId: session.companyId, userId: session.userId, userName: session.name, action: 'CREATE', module: 'StatutoryTables', recordId: table.id, newValues: { kind: table.kind, effectiveFrom: table.effectiveFrom, sourceDocument: table.sourceDocument } })
    return NextResponse.json({ table }, { status: 201 })
  } catch (err) {
    return apiError(err, 'Failed to save the statutory table', 400)
  }
}
