import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'

const VALID_CONDITIONS = ['GOOD', 'DAMAGED', 'LOST']

export async function POST(req: NextRequest, { params }: { params: { issueId: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const returnCondition = String(body.returnCondition ?? 'GOOD').toUpperCase()
  if (!VALID_CONDITIONS.includes(returnCondition)) {
    return NextResponse.json({ error: 'returnCondition must be GOOD, DAMAGED, or LOST' }, { status: 400 })
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const issue = await tx.equipmentIssue.findFirst({ where: { id: params.issueId, companyId } })
      if (!issue) throw new Error('Issue record not found')
      if (issue.returnedAt) throw new Error('This unit has already been returned')

      const result = await tx.equipmentIssue.update({
        where: { id: params.issueId },
        data: {
          returnedAt: new Date(),
          returnedBy: userId,
          returnCondition,
          notes: body.notes ? `${issue.notes ? issue.notes + ' | ' : ''}Return: ${body.notes}` : issue.notes,
        },
      })

      const decrementData: Record<string, { decrement: number } | { increment: number }> = {
        quantity_issued: { decrement: issue.quantity },
      }
      if (returnCondition === 'DAMAGED') decrementData.quantity_damaged = { increment: issue.quantity }
      if (returnCondition === 'LOST') decrementData.quantity_lost = { increment: issue.quantity }

      await tx.equipment.update({ where: { id: issue.equipmentId }, data: decrementData })

      return result
    })

    await logAudit({
      companyId, userId, userName,
      action: 'UPDATE', module: 'EquipmentIssue', recordId: updated.id,
      newValues: { returnCondition },
    })

    return NextResponse.json({ issue: updated })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to process return' }, { status: 400 })
  }
}
