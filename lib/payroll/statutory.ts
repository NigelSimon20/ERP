import { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'

type Db = PrismaClient | Prisma.TransactionClient

// P1-10: statutory deductions come only from APPROVED, effective-dated
// tables a company has entered from the source documents (ZIMRA, NSSA, NEC
// SI, ZIMDEF). No rate is hard-coded; a missing table means that deduction
// is not applied and the payroll preview says so.
export const STATUTORY_KINDS = ['PAYE', 'AIDS_LEVY', 'NSSA', 'NEC', 'ZIMDEF'] as const
export type StatutoryKind = (typeof STATUTORY_KINDS)[number]

const pct = z.number().min(0).max(100)
const money = z.number().min(0)

// ZIMRA monthly bands: tax = income x rate% - deduct, using the band the
// income falls in ("upTo" null = top band).
export const payeConfig = z.object({
  bands: z.array(z.object({ upTo: money.nullable(), rate: pct, deduct: money })).min(1)
    .refine((b) => b[b.length - 1].upTo === null, 'The last band must be open-ended (upTo: null)')
    .refine((b) => b.slice(0, -1).every((x, i, a) => x.upTo !== null && (i === 0 || x.upTo > (a[i - 1].upTo as number))), 'Band limits must increase'),
})
export const aidsLevyConfig = z.object({ rateOfPaye: pct })
// Contributions apply to earnings up to the insurable ceiling (monthly).
export const nssaConfig = z.object({ employeeRate: pct, employerRate: pct, insurableCeiling: money })
export const necConfig = z.object({ employeeRate: pct, employerRate: pct, gradeMinimums: z.record(z.string(), money).default({}) })
export const zimdefConfig = z.object({ employerRate: pct })

export const CONFIG_SCHEMAS: Record<StatutoryKind, z.ZodTypeAny> = {
  PAYE: payeConfig, AIDS_LEVY: aidsLevyConfig, NSSA: nssaConfig, NEC: necConfig, ZIMDEF: zimdefConfig,
}

export interface StatutoryTables {
  PAYE?: z.infer<typeof payeConfig>
  AIDS_LEVY?: z.infer<typeof aidsLevyConfig>
  NSSA?: z.infer<typeof nssaConfig>
  NEC?: z.infer<typeof necConfig>
  ZIMDEF?: z.infer<typeof zimdefConfig>
}

// Latest APPROVED table per kind effective on `asAt`, in `currency`.
export async function loadStatutoryTables(db: Db, companyId: string, asAt: Date, currency = 'USD'): Promise<StatutoryTables> {
  const rows = await db.statutoryTable.findMany({
    where: { companyId, status: 'APPROVED', currency, effectiveFrom: { lte: asAt } },
    orderBy: { effectiveFrom: 'desc' },
  })
  const out: StatutoryTables = {}
  for (const r of rows) {
    const kind = r.kind as StatutoryKind
    if (!STATUTORY_KINDS.includes(kind) || out[kind]) continue
    const parsed = CONFIG_SCHEMAS[kind].safeParse(r.config)
    if (parsed.success) (out as Record<string, unknown>)[kind] = parsed.data
  }
  return out
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function payeFor(taxable: number, cfg: z.infer<typeof payeConfig>): number {
  if (taxable <= 0) return 0
  const band = cfg.bands.find((b) => b.upTo === null || taxable <= b.upTo)!
  return Math.max(0, r2((taxable * band.rate) / 100 - band.deduct))
}
