import { prisma } from './prisma'
import crypto from 'crypto'

export async function logAudit(params: {
  companyId: string
  userId: string
  userName: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'VIEW'
  module: string
  recordId?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  ipAddress?: string
}): Promise<void> {
  try {
    await prisma.auditTrail.create({
      data: {
        id: crypto.randomUUID(),
        companyId: params.companyId,
        userId: params.userId,
        userName: params.userName,
        action: params.action,
        module: params.module,
        recordId: params.recordId,
        oldValues: params.oldValues as never,
        newValues: params.newValues as never,
        ipAddress: params.ipAddress,
      },
    })
  } catch {
    // Audit failure must never break the main operation
  }
}
