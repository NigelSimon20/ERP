import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, companyId: session.companyId },
    include: {
      assignedUser: { select: { id: true, name: true } },
      quotations: { select: { id: true, quoteNumber: true, status: true, total: true, issueDate: true } },
    },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ lead })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const existing = await prisma.lead.findFirst({ where: { id: params.id, companyId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { companyName, contactName, contactEmail, contactPhone, source, status, estimatedValue, probability, assignedUserId, notes, lostReason } = body

  if (status === 'LOST' && !lostReason && existing.status !== 'LOST') {
    return NextResponse.json({ error: 'lostReason is required when moving to LOST' }, { status: 400 })
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: {
      ...(companyName ? { companyName } : {}),
      ...(contactName !== undefined ? { contactName: contactName || '' } : {}),
      ...(contactEmail !== undefined ? { contactEmail: contactEmail || null } : {}),
      ...(contactPhone !== undefined ? { contactPhone: contactPhone || '' } : {}),
      ...(source !== undefined ? { source: source || null } : {}),
      ...(status ? { status } : {}),
      ...(estimatedValue !== undefined && estimatedValue != null ? { estimatedValue: Number(estimatedValue) } : {}),
      ...(probability !== undefined ? { probability: Number(probability) } : {}),
      ...(assignedUserId !== undefined ? { assignedTo: assignedUserId || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(status === 'LOST' && lostReason ? { lostReason } : {}),
    },
    include: { assignedUser: { select: { id: true, name: true } } },
  })

  let newCustomerId: string | undefined

  // Auto-create customer when lead becomes WON
  if (status === 'WON' && existing.status !== 'WON') {
    const existingCustomer = existing.contactEmail
      ? await prisma.customer.findFirst({ where: { email: existing.contactEmail } })
      : null

    if (!existingCustomer) {
      const customer = await prisma.customer.create({
        data: {
          id: crypto.randomUUID(),
          companyId,
          company_name: existing.companyName,
          email: existing.contactEmail || null,
          phone: existing.contactPhone || null,
          contact_person: existing.contactName || null,
          payment_terms: 30,
          credit_limit: 0,
        },
      })
      newCustomerId = customer.id
      await logAudit({ companyId, userId, userName: session.name || 'System', action: 'CREATE', module: 'BD', recordId: customer.id, newValues: { source: 'lead', leadId: params.id } })
    } else {
      newCustomerId = existingCustomer.id
    }
  }

  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'UPDATE', module: 'BD', recordId: params.id, oldValues: { status: existing.status }, newValues: { status: lead.status } })
  return NextResponse.json({ lead, newCustomerId })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId } = session
  const lead = await prisma.lead.findFirst({ where: { id: params.id, companyId } })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.lead.delete({ where: { id: params.id } })
  await logAudit({ companyId, userId, userName: session.name || 'System', action: 'DELETE', module: 'BD', recordId: params.id, oldValues: lead })
  return NextResponse.json({ success: true })
}
