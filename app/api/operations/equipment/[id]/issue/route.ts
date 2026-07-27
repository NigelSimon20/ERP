import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { guardId, quantity, serialNumber, notes } = body

  if (!guardId) return NextResponse.json({ error: 'Guard is required' }, { status: 400 })
  const qty = quantity != null ? Number(quantity) : 1
  if (!(qty > 0)) return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })

  const guard = await prisma.guard.findFirst({ where: { id: guardId, companyId } })
  if (!guard) return NextResponse.json({ error: 'Guard not found' }, { status: 404 })

  try {
    const issue = await prisma.$transaction(async (tx) => {
      const equipment = await tx.equipment.findFirst({ where: { id: params.id, companyId } })
      if (!equipment) throw new Error('Equipment not found')

      // Server-side invariant the audit flagged as missing: issuing more than
      // what's in stock (accounting for what's already issued/damaged/lost)
      // must be rejected, not silently allowed to go negative.
      const inStock = equipment.quantity_in_stock ?? 0
      const alreadyOut = (equipment.quantity_issued ?? 0) + (equipment.quantity_damaged ?? 0) + (equipment.quantity_lost ?? 0)
      if (alreadyOut + qty > inStock) {
        throw new Error(`Only ${Math.max(0, inStock - alreadyOut)} unit(s) available to issue`)
      }

      const created = await tx.equipmentIssue.create({
        data: {
          id: crypto.randomUUID(),
          companyId,
          equipmentId: params.id,
          guardId,
          quantity: qty,
          serialNumber: serialNumber || null,
          issuedBy: userId,
          notes: notes || null,
        },
      })

      await tx.equipment.update({
        where: { id: params.id },
        data: { quantity_issued: { increment: qty } },
      })

      return created
    })

    await logAudit({
      companyId, userId, userName,
      action: 'CREATE', module: 'EquipmentIssue', recordId: issue.id,
      newValues: { equipmentId: params.id, guardId, quantity: qty },
    })

    return NextResponse.json({ issue }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to issue equipment' }, { status: 400 })
  }
}
