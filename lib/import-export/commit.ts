import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { getModuleConfig } from './registry'

// Chunk-per-transaction (rather than one transaction for the whole file) so
// a single bad row can't hold a DB transaction open indefinitely and so the
// pgbouncer transaction-mode pooler never sees one enormous multi-thousand-
// row transaction -- mirrors lib/backup.ts's chunking rationale.
const CHUNK_SIZE = 50

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function toErrorArray(errors: unknown): string[] {
  return Array.isArray(errors) ? (errors as string[]) : []
}

export async function commitImportJob(
  importJobId: string,
  excludeRowIds: string[] = []
): Promise<{ successCount: number; failureCount: number }> {
  const job = await prisma.importJob.findUnique({ where: { id: importJobId }, include: { rows: true } })
  if (!job) throw new Error('Import job not found')
  if (job.mode === 'PREVIEW_ONLY') throw new Error('Preview-only jobs cannot be committed')
  if (job.status !== 'READY') throw new Error(`Import job is not ready to commit (status: ${job.status})`)

  const config = getModuleConfig(job.module)
  await prisma.importJob.update({ where: { id: job.id }, data: { status: 'PROCESSING' } })

  const excluded = new Set(excludeRowIds)
  if (excluded.size > 0) {
    await prisma.importJobRow.updateMany({
      where: { importJobId: job.id, id: { in: Array.from(excluded) } },
      data: { action: 'SKIPPED', errors: ['Excluded by user before commit'] },
    })
  }

  const eligibleRows = job.rows.filter(
    (r) => (r.classification === 'NEW' || r.classification === 'UPDATE') && !excluded.has(r.id)
  )

  // Batch-prepare fields (e.g. sequential codes) for every row that will be
  // created, in one upfront pass -- see prepareBatch's doc comment for why
  // this can't be done per row inside the chunk loop below.
  const newRows = eligibleRows.filter((r) => r.classification === 'NEW')
  const preparedByRowId = new Map<string, Record<string, unknown>>()
  if (config.prepareBatch && newRows.length > 0) {
    const prepared = await config.prepareBatch(
      newRows.map((r) => r.mappedData as Record<string, unknown>),
      job.companyId
    )
    newRows.forEach((row, i) => preparedByRowId.set(row.id, prepared[i]))
  }

  let successCount = 0
  let failureCount = 0

  for (const rowsChunk of chunk(eligibleRows, CHUNK_SIZE)) {
    await prisma.$transaction(async (tx) => {
      for (const row of rowsChunk) {
        const mapped = preparedByRowId.get(row.id) ?? (row.mappedData as Record<string, unknown>)
        try {
          if (row.classification === 'NEW') {
            const data = await config.buildCreateData(mapped, job.companyId)
            const created = await config.create(tx, data)
            await tx.importJobRow.update({ where: { id: row.id }, data: { action: 'CREATE', recordId: created.id } })
          } else {
            const existing = await config.findExisting(tx, job.companyId, mapped)
            if (!existing) throw new Error('Matching record no longer exists')
            const updateData = config.buildUpdateData(mapped, existing)
            await config.update(tx, existing.id, updateData)
            await tx.importJobRow.update({
              where: { id: row.id },
              data: { action: 'UPDATE', recordId: existing.id, previousData: existing as object },
            })
          }
          successCount++
        } catch (err) {
          failureCount++
          const message = err instanceof Error ? err.message : 'Unknown error'
          await tx.importJobRow.update({
            where: { id: row.id },
            data: { action: 'SKIPPED', errors: [...toErrorArray(row.errors), message] },
          })
        }
      }
    }, { timeout: 30000 })
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: 'COMPLETED', successCount, failureCount, completedAt: new Date() },
  })

  await prisma.notification.create({
    data: {
      id: crypto.randomUUID(),
      companyId: job.companyId,
      userId: job.userId,
      type: 'IMPORT_COMPLETE',
      title: `Import complete: ${config.label}`,
      message: `${successCount} row(s) imported, ${failureCount} failed`,
      link: `/settings/import-logs/${job.id}`,
      read: false,
    },
  })

  await logAudit({
    companyId: job.companyId,
    userId: job.userId,
    userName: job.userName,
    action: 'CREATE',
    module: `Import:${config.label}`,
    recordId: job.id,
    newValues: { successCount, failureCount, mode: job.mode },
  })

  return { successCount, failureCount }
}
