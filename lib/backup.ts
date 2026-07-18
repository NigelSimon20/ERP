import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

// Never include credentials/secrets in an exportable backup file.
const EXCLUDED_MODELS = new Set(['User', 'OtpToken', 'GoogleDriveConnection'])

const MODELS = Prisma.dmmf.datamodel.models.filter((m) => !EXCLUDED_MODELS.has(m.name))

// Keeps concurrent DB round-trips within what the pgbouncer transaction-mode
// pooler can comfortably handle, while still running well ahead of a fully
// sequential loop (1638 rows sequentially took ~5 minutes in testing).
const CONCURRENCY = 10

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function modelAccessor(modelName: string) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

function hasCompanyId(model: Prisma.DMMF.Model) {
  return model.fields.some((f) => f.name === 'companyId')
}

function coerceValue(field: Prisma.DMMF.Field, value: unknown) {
  if (value === null || value === undefined) return value
  if (field.isList || field.kind !== 'scalar') return value
  switch (field.type) {
    case 'DateTime':
      return new Date(value as string)
    case 'Int':
      return typeof value === 'number' ? Math.trunc(value) : parseInt(String(value), 10)
    case 'Float':
      return typeof value === 'number' ? value : parseFloat(String(value))
    case 'Boolean':
      return Boolean(value)
    default:
      return value
  }
}

function coerceRow(model: Prisma.DMMF.Model, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const field of model.fields) {
    if (field.kind === 'object') continue // skip relation fields, only scalar columns
    if (!(field.name in row)) continue
    out[field.name] = coerceValue(field, row[field.name])
  }
  return out
}

export interface BackupExport {
  exportDate: string
  companyId: string
  data: Record<string, unknown[]>
}

export async function exportCompanyData(companyId: string): Promise<BackupExport> {
  const entries = await mapWithConcurrency(MODELS, CONCURRENCY, async (model) => {
    const delegate = (prisma as unknown as Record<string, { findMany: (args?: unknown) => Promise<unknown[]> }>)[modelAccessor(model.name)]
    if (!delegate?.findMany) return { name: model.name, rows: [] as unknown[] }
    const where = hasCompanyId(model) ? { companyId } : undefined
    const rows = await delegate.findMany(where ? { where } : undefined)
    return { name: model.name, rows }
  })

  const data: Record<string, unknown[]> = {}
  for (const { name, rows } of entries) data[name] = rows

  return { exportDate: new Date().toISOString(), companyId, data }
}

export function previewRestoreCounts(data: Record<string, unknown[]>) {
  const counts: Record<string, number> = {}
  for (const model of MODELS) {
    const rows = data[model.name]
    if (Array.isArray(rows)) counts[model.name] = rows.length
  }
  return counts
}

export interface RestoreTableResult {
  restored: number
  failed: number
}

interface PendingRow {
  modelName: string
  row: Record<string, unknown>
}

/**
 * Upserts every row of every recognized table. Runs multiple passes over
 * the whole dataset so rows can succeed once their FK targets (created in
 * an earlier pass, in any table) exist — avoids needing a hand-maintained
 * topological order across 58 models. Each pass processes rows concurrently
 * (bounded) rather than one at a time.
 */
export async function restoreCompanyData(
  companyId: string,
  data: Record<string, unknown[]>
): Promise<Record<string, RestoreTableResult>> {
  const modelsByName = new Map(MODELS.map((m) => [m.name, m]))
  const results: Record<string, RestoreTableResult> = {}

  let pending: PendingRow[] = []
  for (const model of MODELS) {
    const rows = data[model.name]
    if (!Array.isArray(rows) || rows.length === 0) continue
    results[model.name] = { restored: 0, failed: 0 }
    for (const row of rows) pending.push({ modelName: model.name, row: row as Record<string, unknown> })
  }

  const MAX_PASSES = 4
  for (let pass = 0; pass < MAX_PASSES && pending.length > 0; pass++) {
    const outcomes = await mapWithConcurrency(pending, CONCURRENCY, async ({ modelName, row }) => {
      const model = modelsByName.get(modelName)!
      const delegate = (prisma as unknown as Record<string, {
        upsert: (args: unknown) => Promise<unknown>
        findUnique: (args: unknown) => Promise<{ companyId?: string } | null>
      }>)[modelAccessor(modelName)]
      if (!delegate?.upsert) return { modelName, row, ok: true } // nothing we can do with it, don't retry forever

      const record = coerceRow(model, row)
      if (hasCompanyId(model)) {
        record.companyId = companyId // never trust the file's tenant id
        // A row with this id may already exist and belong to a different
        // company (e.g. a backup file with foreign/leaked ids) — upserting
        // by id alone would silently reparent and overwrite that tenant's
        // record. Only ever create/update rows that are ours.
        const existing = await delegate.findUnique({ where: { id: record.id }, select: { companyId: true } })
        if (existing && existing.companyId !== companyId) return { modelName, row, ok: false }
      }
      try {
        await delegate.upsert({ where: { id: record.id }, update: record, create: record })
        return { modelName, row, ok: true }
      } catch {
        return { modelName, row, ok: false }
      }
    })

    const stillFailed: PendingRow[] = []
    let anyProgress = false
    for (const outcome of outcomes) {
      if (outcome.ok) {
        results[outcome.modelName].restored++
        anyProgress = true
      } else {
        stillFailed.push({ modelName: outcome.modelName, row: outcome.row })
      }
    }

    pending = stillFailed
    if (!anyProgress) break
  }

  for (const { modelName } of pending) {
    results[modelName].failed++
  }

  return results
}
