import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { getModuleConfig } from './registry'

export async function rollbackImportJob(
  importJobId: string,
  actor: { userId: string; userName: string }
): Promise<{ deleted: number; restored: number }> {
  const job = await prisma.importJob.findUnique({ where: { id: importJobId }, include: { rows: true } })
  if (!job) throw new Error('Import job not found')
  if (job.status !== 'COMPLETED') throw new Error(`Only a completed import can be rolled back (status: ${job.status})`)

  const config = getModuleConfig(job.module)
  let deleted = 0
  let restored = 0

  await prisma.$transaction(async (tx) => {
    for (const row of job.rows) {
      if (row.action === 'CREATE' && row.recordId) {
        try {
          await config.remove(tx, row.recordId)
          deleted++
        } catch {
          // Record may since have been referenced elsewhere (e.g. a deployment
          // created after the import) and blocked from deletion by the
          // module's own guard rails -- leave it rather than fail the whole
          // rollback.
        }
      } else if (row.action === 'UPDATE' && row.recordId && row.previousData) {
        const { id: _id, companyId: _companyId, ...previousFields } = row.previousData as Record<string, unknown>
        await config.update(tx, row.recordId, previousFields)
        restored++
      }
    }
    await tx.importJob.update({ where: { id: job.id }, data: { status: 'ROLLED_BACK' } })
  }, { timeout: 60000 })

  await logAudit({
    companyId: job.companyId,
    userId: actor.userId,
    userName: actor.userName,
    action: 'DELETE',
    module: `Import:${config.label}`,
    recordId: job.id,
    oldValues: { deleted, restored },
  })

  return { deleted, restored }
}
