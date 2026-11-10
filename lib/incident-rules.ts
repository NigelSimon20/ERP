import { z } from 'zod'

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export const INCIDENT_STATUSES = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'] as const

const date = z.union([z.string(), z.date()]).transform((v, ctx) => {
  const d = new Date(v)
  if (isNaN(d.getTime())) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Not a valid date' }); return z.NEVER }
  return d
})

export const incidentCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(5000),
  siteId: z.string().min(1, 'Site is required'),
  guardId: z.string().optional().nullable().transform((v) => v || null),
  severity: z.enum(SEVERITIES).default('MEDIUM'),
  reportedAt: date.optional(),
})

export const incidentUpdateSchema = z.object({
  status: z.enum(INCIDENT_STATUSES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  notes: z.string().max(5000).optional().nullable(),
})
