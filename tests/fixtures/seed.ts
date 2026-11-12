import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { postOpeningBalance } from '@/lib/opening-balances'

const id = () => crypto.randomUUID()

// The regression fixture from CLAUDE_CODE_REMAINING_FIXES.md Step 1:
// "ZZTEST Co", fiscal year from 01-01, VAT 15.5%, the listed chart of
// accounts, 2 USD banks, customers A and B, 1 supplier, 2 sites and 3
// active guards at $6/day. Each call creates a fresh, isolated tenant.
//
// Bank 1 starts with `bank1Funds` (default 1000) as a balanced opening-balance
// journal against 3050, so payments and payroll have money to spend and the
// stored bank balance, its GL account and the ledger agree from the start.
export async function seedZZTest(opts: { label?: string; bank1Funds?: number } = {}) {
  const label = opts.label ?? 'ZZTEST Co'
  const companyId = id()
  const acct = (code: string, name: string, type: string) => ({
    id: id(), companyId, account_code: code, account_name: name, account_type: type, is_active: true, currency: 'USD', current_balance: 0,
  })
  const accounts = {
    bank1: acct('1010', 'Bank 1 USD', 'ASSET'),
    bank2: acct('1020', 'Bank 2 USD', 'ASSET'),
    receivables: acct('1100', 'Accounts Receivable', 'ASSET'),
    inventory: acct('1200', 'Inventory', 'ASSET'),
    prepaid: acct('1400', 'Prepaid Expenses', 'ASSET'),
    fixedAssets: acct('1500', 'Fixed Assets', 'ASSET'),
    accumulatedDepreciation: acct('1510', 'Accumulated Depreciation', 'ASSET'),
    payables: acct('2000', 'Accounts Payable', 'LIABILITY'),
    vat: acct('2100', 'VAT Payable', 'LIABILITY'),
    payrollLiabilities: acct('2200', 'Payroll Liabilities', 'LIABILITY'),
    accrued: acct('2300', 'Accrued Expenses', 'LIABILITY'),
    openingBalanceEquity: acct('3050', 'Opening Balance Equity', 'EQUITY'),
    retainedEarnings: acct('3100', 'Retained Earnings', 'EQUITY'),
    revenue: acct('4100', 'Revenue', 'REVENUE'),
    officeExpenses: acct('5100', 'Office Expenses', 'EXPENSE'),
    depreciation: acct('5200', 'Depreciation', 'EXPENSE'),
    guardSalaries: acct('6106', 'Guard Salaries', 'EXPENSE'),
  }

  await prisma.company.create({ data: { id: companyId, name: label, fiscalYearStart: '01-01', defaultVatRate: 15.5, currency: 'USD' } })
  await prisma.chartOfAccount.createMany({ data: Object.values(accounts) })
  await prisma.company.update({
    where: { id: companyId },
    data: {
      receivablesAccountId: accounts.receivables.id,
      vatAccountId: accounts.vat.id,
      payablesAccountId: accounts.payables.id,
      salariesExpenseAccountId: accounts.guardSalaries.id,
      payrollLiabilitiesAccountId: accounts.payrollLiabilities.id,
      fixedAssetsAccountId: accounts.fixedAssets.id,
      accumulatedDepreciationAccountId: accounts.accumulatedDepreciation.id,
      depreciationExpenseAccountId: accounts.depreciation.id,
      inventoryAccountId: accounts.inventory.id,
    },
  })

  const password = await hashPassword('Correct-horse-1')
  const tag = companyId.slice(0, 8)
  const mkUser = (key: string, role: string) => ({
    id: id(), companyId, name: `${label} ${key}`, email: `${key}.${tag}@zztest.local`, password, role,
  })
  const users = {
    admin: mkUser('admin', 'SUPER_ADMIN'),
    finance: mkUser('finance', 'FINANCE_MANAGER'),
    finance2: mkUser('finance2', 'FINANCE_MANAGER'),
    ops: mkUser('ops', 'OPERATIONS_MANAGER'),
    hr: mkUser('hr', 'HR_MANAGER'),
  }
  await prisma.user.createMany({ data: Object.values(users) })

  const customers = {
    a: { id: id(), companyId, company_name: 'Customer A', is_active: true, currency: 'USD' },
    b: { id: id(), companyId, company_name: 'Customer B', is_active: true, currency: 'USD' },
  }
  await prisma.customer.createMany({ data: Object.values(customers) })
  const supplier = { id: id(), companyId, company_name: 'ZZ Supplier', is_active: true, currency: 'USD' }
  await prisma.supplier.create({ data: supplier })

  const sites = {
    s1: { id: id(), companyId, site_name: 'Site One', status: 'Active' as const, is_active: true },
    s2: { id: id(), companyId, site_name: 'Site Two', status: 'Active' as const, is_active: true },
  }
  await prisma.site.createMany({ data: Object.values(sites) })

  const guards = [1, 2, 3].map((n) => ({
    id: id(), companyId, full_name: `ZZ Guard ${n}`, employee_code: `ZZ-${n}`, employee_type: 'Guard', status: 'Active' as const, daily_rate: 6,
  }))
  await prisma.guard.createMany({ data: guards })

  const funds = opts.bank1Funds ?? 1000
  const banks = {
    b1: { id: id(), companyId, account_name: 'Bank 1', bank_name: 'ZZ Bank', chart_account_id: accounts.bank1.id, currency: 'USD', current_balance: funds, opening_balance: 0, is_active: true },
    b2: { id: id(), companyId, account_name: 'Bank 2', bank_name: 'ZZ Bank', chart_account_id: accounts.bank2.id, currency: 'USD', current_balance: 0, opening_balance: 0, is_active: true },
  }
  await prisma.bankAccount.createMany({ data: Object.values(banks) })
  if (funds) {
    await prisma.$transaction((tx) => postOpeningBalance(tx, { companyId, accountId: accounts.bank1.id, amount: funds, entryDate: '2026-01-01', userId: users.admin.id, label: 'BANK1' }))
  }

  const sessionFor = (u: (typeof users)[keyof typeof users]) => ({
    userId: u.id, companyId, role: u.role, name: u.name, email: u.email,
  })
  return { companyId, accounts, users, customers, supplier, sites, guards, banks, sessionFor }
}

export type ZZ = Awaited<ReturnType<typeof seedZZTest>>
