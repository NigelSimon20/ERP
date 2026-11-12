import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { ShiftType } from '@prisma/client'

const SHIFT_TYPES = Object.values(ShiftType)

export class DeploymentValidationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface CreateDeploymentParams {
  companyId: string
  guardId: string
  siteId: string
  shiftType?: string
  startDate: string | Date
  endDate?: string | Date | null
  hoursPerDay?: number
  ratePerHour?: number
  sourceCoverageRequestId?: string | null
}

// Shared by POST /api/operations/deployments and the Coverage Request
// "Assign Guard" action so both go through the exact same site-active and
// double-booking validation -- one place to keep them consistent instead of
// two copies that can drift. Throws DeploymentValidationError on any
// validation failure; callers catch it to produce the right HTTP status.
export async function createDeployment(params: CreateDeploymentParams) {
  const { companyId, guardId, siteId, shiftType, startDate, endDate, hoursPerDay, ratePerHour, sourceCoverageRequestId } = params

  if (!guardId || !siteId || !startDate) {
    throw new DeploymentValidationError('guardId, siteId, and startDate are required')
  }
  // A9.4: bad dates and numbers reached Prisma (500); the guard was never
  // checked against the company.
  const invalidDate = (v: unknown) => isNaN(new Date(v as string).getTime())
  if (invalidDate(startDate)) throw new DeploymentValidationError('Start date is not a valid date')
  if (endDate && invalidDate(endDate)) throw new DeploymentValidationError('End date is not a valid date')
  if (shiftType && !SHIFT_TYPES.includes(shiftType as ShiftType)) throw new DeploymentValidationError(`Shift must be one of ${SHIFT_TYPES.join(', ')}`)
  for (const [label, v, max] of [['Hours per day', hoursPerDay, 24], ['Rate per hour', ratePerHour, 1e6]] as const) {
    if (v == null || (v as unknown) === '') continue
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > max) throw new DeploymentValidationError(`${label} must be a number between 0 and ${max}`)
  }
  if (endDate && new Date(endDate) <= new Date(startDate)) {
    throw new DeploymentValidationError('End date must be after start date')
  }

  const [site, guard] = await Promise.all([
    prisma.site.findFirst({ where: { id: siteId, companyId } }),
    prisma.guard.findFirst({ where: { id: guardId, companyId }, select: { id: true } }),
  ])
  if (!site) throw new DeploymentValidationError('Site not found', 404)
  if (!guard) throw new DeploymentValidationError('Guard not found', 404)
  if (site.status && site.status !== 'Active') {
    throw new DeploymentValidationError(`Cannot deploy to a ${site.status} site`)
  }

  const overlap = await prisma.deployment.findFirst({
    where: {
      companyId,
      guardId,
      status: 'ACTIVE',
      startDate: { lte: endDate ? new Date(endDate) : new Date('9999-12-31') },
      OR: [{ endDate: null }, { endDate: { gte: new Date(startDate) } }],
    },
  })
  if (overlap) throw new DeploymentValidationError('Guard is already deployed during this period')

  return prisma.deployment.create({
    data: {
      id: crypto.randomUUID(),
      companyId,
      guardId,
      siteId,
      shiftType: (shiftType as ShiftType) || 'DAY',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      hoursPerDay: hoursPerDay != null ? Number(hoursPerDay) : 8,
      ratePerHour: ratePerHour != null ? Number(ratePerHour) : 0,
      updatedAt: new Date(),
      status: 'ACTIVE',
      sourceCoverageRequestId: sourceCoverageRequestId ?? null,
    },
  })
}
