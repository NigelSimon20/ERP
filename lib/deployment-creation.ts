import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

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
  if (endDate && new Date(endDate) <= new Date(startDate)) {
    throw new DeploymentValidationError('End date must be after start date')
  }

  const site = await prisma.site.findFirst({ where: { id: siteId, companyId } })
  if (!site) throw new DeploymentValidationError('Site not found', 404)
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
      shiftType: (shiftType as any) || 'DAY',
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
