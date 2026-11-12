import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { createDeployment, DeploymentValidationError } from '@/lib/deployment-creation'

// Assigns one guard at a time to an APPROVED coverage request, creating a
// real Deployment each time (reusing the same site-active + double-booking
// validation the normal deployment-creation route uses) instead of leaving
// "approved" as a dead end that still requires a separate manual deployment
// with no link back to the request.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { guardId, shiftType, hoursPerDay, ratePerHour } = body

  const request = await prisma.coverageRequest.findFirst({ where: { id: params.id, companyId } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.status !== 'APPROVED') {
    return NextResponse.json({ error: `Request must be APPROVED before assigning guards (currently ${request.status})` }, { status: 400 })
  }

  try {
    const deployment = await createDeployment({
      companyId,
      guardId,
      siteId: request.siteId,
      shiftType,
      startDate: request.startDate,
      endDate: request.endDate,
      hoursPerDay,
      ratePerHour,
      sourceCoverageRequestId: request.id,
    })

    const filledCount = await prisma.deployment.count({ where: { sourceCoverageRequestId: request.id, status: 'ACTIVE' } })
    const nowFulfilled = filledCount >= request.requiredGuards

    const updatedRequest = nowFulfilled
      ? await prisma.coverageRequest.update({ where: { id: request.id }, data: { status: 'FULFILLED' } })
      : request

    await logAudit({
      companyId, userId, userName,
      action: 'CREATE', module: 'CoverageRequestAssignment', recordId: deployment.id,
      newValues: { coverageRequestId: request.id, guardId, filledCount, requiredGuards: request.requiredGuards },
    })

    return NextResponse.json({ deployment, request: updatedRequest, filledCount, requiredGuards: request.requiredGuards }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof DeploymentValidationError) return NextResponse.json({ error: err.message, code: err.status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR' }, { status: err.status })
    throw err
  }
}
