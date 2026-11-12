import crypto from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { accountCodeProblem } from '@/lib/journal-rules'

// A6: a new company had no chart of accounts, so nothing could post. This
// loads a default chart for a security company and links the Settings
// mappings -- only when the company has no accounts at all, so it never
// touches an existing chart and running it twice creates nothing.
// Bank GL accounts (101x) are created with each bank account, not here.

type Kind = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
export interface DefaultAccount { code: string; name: string; type: Kind; subtype: string; control?: boolean }

export const DEFAULT_CHART: DefaultAccount[] = [
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subtype: 'Current Asset', control: true },
  { code: '1200', name: 'Inventory', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1400', name: 'Prepaid Expenses', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1450', name: 'Supplier Advances', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1500', name: 'Fixed Assets', type: 'ASSET', subtype: 'Fixed Asset' },
  { code: '1510', name: 'Accumulated Depreciation', type: 'ASSET', subtype: 'Fixed Asset' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'Current Liability', control: true },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2200', name: 'Payroll Liabilities (PAYE, NSSA, NEC, ZIMDEF)', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2210', name: 'Net Pay Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2300', name: 'Accrued Expenses', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '3000', name: 'Share Capital', type: 'EQUITY', subtype: 'Equity' },
  { code: '3050', name: 'Opening Balance Equity', type: 'EQUITY', subtype: 'Equity' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', subtype: 'Equity' },
  { code: '4100', name: 'Guarding Services Revenue', type: 'REVENUE', subtype: 'Operating Revenue' },
  { code: '4200', name: 'Alarm and Response Revenue', type: 'REVENUE', subtype: 'Operating Revenue' },
  { code: '4900', name: 'Other Income', type: 'REVENUE', subtype: 'Other Revenue' },
  { code: '5100', name: 'Office and Administration', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5200', name: 'Depreciation', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5300', name: 'Uniforms and Equipment', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5400', name: 'Vehicles and Fuel', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5500', name: 'Communications', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5600', name: 'Bank Charges', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '6106', name: 'Guard Salaries and Wages', type: 'EXPENSE', subtype: 'Operating Expense' },
]

// Settings mapping -> account code.
const LINKS = {
  receivablesAccountId: '1100', payablesAccountId: '2000', vatAccountId: '2100',
  salariesExpenseAccountId: '6106', payrollLiabilitiesAccountId: '2200', netPayPayableAccountId: '2210',
  fixedAssetsAccountId: '1500', accumulatedDepreciationAccountId: '1510', depreciationExpenseAccountId: '5200',
  inventoryAccountId: '1200',
} as const

export async function seedChartOfAccounts(db: PrismaClient, companyId: string, userId?: string): Promise<{ created: number }> {
  for (const a of DEFAULT_CHART) {
    const problem = accountCodeProblem(a.code, a.type)
    if (problem) throw new Error(`Default chart is invalid: ${problem}`)
  }
  return db.$transaction(async (tx) => {
    // Lock the company row so two simultaneous loads can't both see 0 accounts.
    const [company] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`
    if (!company) throw new Error('Company not found')
    if ((await tx.chartOfAccount.count({ where: { companyId } })) > 0) return { created: 0 }

    const now = new Date().toISOString()
    const idByCode = new Map(DEFAULT_CHART.map((a) => [a.code, crypto.randomUUID()]))
    await tx.chartOfAccount.createMany({
      data: DEFAULT_CHART.map((a) => ({
        id: idByCode.get(a.code)!, companyId, account_code: a.code, account_name: a.name, account_type: a.type,
        account_subtype: a.subtype, is_active: true, is_control_account: a.control ?? false, current_balance: 0,
        currency: 'USD', created_date: now, updated_date: now, created_by_id: userId ?? null, is_sample: false,
      })),
    })
    // Only fill mappings that are empty.
    const current = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: Object.fromEntries(Object.keys(LINKS).map((k) => [k, true])) as Record<keyof typeof LINKS, true> })
    const data: Prisma.CompanyUpdateInput = {}
    for (const [key, code] of Object.entries(LINKS) as [keyof typeof LINKS, string][]) {
      if (!current[key]) (data as Record<string, string>)[key] = idByCode.get(code)!
    }
    if (Object.keys(data).length) await tx.company.update({ where: { id: companyId }, data })
    return { created: DEFAULT_CHART.length }
  })
}
