import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { nextContractNumber } from '@/lib/auto-numbers'

function mapContract(c: { contractValue: unknown; [k: string]: unknown }) {
  const { contractValue, ...rest } = c
  return { ...rest, contractValue: Number(contractValue) }
}

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status')

  const contracts = await prisma.contract.findMany({
    where: { companyId: session.companyId, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ contracts: contracts.map(mapContract) })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const body = await req.json()
  const { title, customerId, siteId, quotationId, contractValue, billingFrequency, startDate, endDate, notes, status } = body

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (contractValue === undefined || contractValue === null || Number(contractValue) <= 0) {
    return NextResponse.json({ error: 'contractValue must be greater than 0' }, { status: 400 })
  }
  if (!startDate) return NextResponse.json({ error: 'startDate is required' }, { status: 400 })

  const contractNumber = await nextContractNumber(companyId)
  const contractId = crypto.randomUUID()

  const contract = await prisma.contract.create({
    data: {
      id: contractId,
      companyId,
      contractNumber,
      customerId: customerId || null,
      siteId: siteId || null,
      quotationId: quotationId || null,
      title,
      contractValue: Number(contractValue),
      billingFrequency: billingFrequency || null,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      status: status && ['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'].includes(status) ? status : 'DRAFT',
      notes: notes || null,
      createdBy: userId,
      updatedAt: new Date(),
    },
  })

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'CREATE', module: 'BD', recordId: contract.id, newValues: { contractNumber, contractValue: Number(contractValue) } })
  return NextResponse.json({ contract: mapContract(contract) }, { status: 201 })
}
