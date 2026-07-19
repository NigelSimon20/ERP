import type { Prisma } from '@prisma/client'

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum'

export interface FieldSpec {
  key: string
  label: string
  required?: boolean
  type: FieldType
  enumValues?: string[]
  example?: string | number | boolean
  description?: string
}

export type ImportMode = 'CREATE' | 'UPDATE' | 'UPSERT' | 'PREVIEW_ONLY'

export type RowClassification = 'NEW' | 'UPDATE' | 'DUPLICATE' | 'INVALID'

export interface ValidatedRow {
  rowNumber: number
  rawData: Record<string, unknown>
  mappedData: Record<string, unknown>
  classification: RowClassification
  errors: string[]
  existingId?: string
}

export interface ExportColumn {
  key: string
  label: string
}

// TRecord is loosely typed (rather than generic-per-Prisma-model) because
// each module config wires up its own concrete Prisma delegate (Guard,
// Customer, Supplier, Site) internally -- the engine only ever needs the
// common `id` field plus whatever raw column values a module chooses to
// stash on it for rollback snapshotting.
export type ImportRecord = Record<string, unknown> & { id: string }

export interface ModuleImportConfig {
  moduleKey: string
  label: string
  fields: FieldSpec[]
  exportColumns: ExportColumn[]
  /** Additional cross-field/business-rule validation beyond per-field type+required+enum checks. */
  customValidate?: (mapped: Record<string, unknown>) => string[]
  /** Composite natural-key string used to detect duplicate rows within the same uploaded file. Return null if the row has no natural key present. */
  naturalKeyOf: (mapped: Record<string, unknown>) => string | null
  findExisting: (tx: Prisma.TransactionClient, companyId: string, mapped: Record<string, unknown>) => Promise<ImportRecord | null>
  /**
   * Runs once per commit job (not per row) against every row that will be
   * created, before any DB writes happen. Used to assign natural-key-style
   * fields (e.g. employee_code) sequentially from a single read of the
   * current max -- per-row DB counters that read via the plain client
   * (rather than the commit transaction) can't see a same-job row's own
   * just-created-but-uncommitted record, so sequential per-row generation
   * silently hands out duplicates within one multi-row import.
   */
  prepareBatch?: (rows: Record<string, unknown>[], companyId: string) => Promise<Record<string, unknown>[]>
  buildCreateData: (mapped: Record<string, unknown>, companyId: string) => Promise<Record<string, unknown>>
  /** Partial update payload -- only fields present in `mapped` should be included, so blank cells in an update import don't clobber existing values. */
  buildUpdateData: (mapped: Record<string, unknown>, existing: ImportRecord) => Record<string, unknown>
  create: (tx: Prisma.TransactionClient, data: Record<string, unknown>) => Promise<ImportRecord>
  update: (tx: Prisma.TransactionClient, id: string, data: Record<string, unknown>) => Promise<ImportRecord>
  remove: (tx: Prisma.TransactionClient, id: string) => Promise<void>
  listForExport: (companyId: string) => Promise<ImportRecord[]>
}
