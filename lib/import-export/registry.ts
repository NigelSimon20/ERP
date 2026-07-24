import type { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { nextForceNumber, nextCustomerNumber, nextSupplierNumber, nextSiteNumber, parseNum } from '@/lib/auto-numbers'
import { splitName } from '@/lib/guards'
import type { ImportRecord, ModuleImportConfig } from './types'

function normalizeKey(value: unknown): string {
  return String(value).trim().toLowerCase()
}

const employeesConfig: ModuleImportConfig = {
  moduleKey: 'employees',
  label: 'Employees',
  fields: [
    { key: 'full_name', label: 'Full Name', type: 'string', required: true },
    { key: 'employee_code', label: 'Employee #', type: 'string', description: 'Leave blank to auto-generate' },
    { key: 'force_number', label: 'Force Number', type: 'string', description: 'Leave blank to auto-generate' },
    { key: 'national_id', label: 'National ID', type: 'string' },
    { key: 'phone', label: 'Phone', type: 'string' },
    { key: 'whatsapp', label: 'WhatsApp', type: 'string' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'address', label: 'Address', type: 'string' },
    { key: 'city', label: 'City', type: 'string' },
    { key: 'region', label: 'Region', type: 'string' },
    { key: 'gender', label: 'Gender', type: 'string' },
    { key: 'department', label: 'Department', type: 'string' },
    { key: 'position', label: 'Position', type: 'string' },
    { key: 'employee_type', label: 'Rank', type: 'string', example: 'Guard' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'hire_date', label: 'Date Hired', type: 'date' },
    { key: 'contract_start_date', label: 'Contract Start', type: 'date' },
    { key: 'contract_expiry_date', label: 'Contract Expiry', type: 'date' },
    { key: 'basic_salary', label: 'Basic Salary', type: 'number' },
    { key: 'daily_rate', label: 'Daily Rate', type: 'number' },
    { key: 'bank_name', label: 'Bank Name', type: 'string' },
    { key: 'bank_account_number', label: 'Bank Account Number', type: 'string' },
    { key: 'ecocash_number', label: 'Ecocash Number', type: 'string' },
    { key: 'next_of_kin_name', label: 'Next of Kin Name', type: 'string' },
    { key: 'next_of_kin_phone', label: 'Next of Kin Phone', type: 'string' },
    { key: 'next_of_kin_relationship', label: 'Next of Kin Relationship', type: 'string' },
    { key: 'status', label: 'Status', type: 'enum', enumValues: ['Active', 'Resigned', 'Terminated', 'Blacklisted'], example: 'Active' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  exportColumns: [
    { key: 'employee_code', label: 'Emp #' },
    { key: 'full_name', label: 'Name' },
    { key: 'national_id', label: 'ID Number' },
    { key: 'phone', label: 'Phone' },
    { key: 'employee_type', label: 'Rank' },
    { key: 'department', label: 'Department' },
    { key: 'status', label: 'Status' },
    { key: 'daily_rate', label: 'Daily Rate' },
    { key: 'hire_date', label: 'Date Hired' },
  ],
  naturalKeyOf(mapped) {
    if (mapped.national_id) return `nid:${normalizeKey(mapped.national_id)}`
    if (mapped.employee_code) return `code:${normalizeKey(mapped.employee_code)}`
    return null
  },
  async prepareBatch(rows, companyId) {
    // employee_code has no atomic Company counter (unlike force_number) --
    // nextEmployeeNumber's findFirst-then-parse approach reads via the plain
    // client, so within one bulk import it can't see earlier rows in the
    // same job that haven't committed yet and hands out the same code
    // repeatedly. Assign the whole batch's codes from a single upfront scan
    // instead of one DB round trip per row.
    const [lastGuard, company] = await Promise.all([
      prisma.guard.findFirst({ where: { companyId }, orderBy: { employee_code: 'desc' }, select: { employee_code: true } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { forceNumberPrefix: true } }),
    ])
    const prefix = company?.forceNumberPrefix ? `${company.forceNumberPrefix}-` : ''
    let next = parseNum(lastGuard?.employee_code ?? null) + 1

    return rows.map((row) => {
      if (row.employee_code) return row
      const employee_code = `${prefix}EMP-${String(next).padStart(4, '0')}`
      next += 1
      return { ...row, employee_code }
    })
  },
  async findExisting(tx, companyId, mapped) {
    const conditions: Prisma.GuardWhereInput[] = []
    if (mapped.national_id) conditions.push({ national_id: String(mapped.national_id) })
    if (mapped.employee_code) conditions.push({ employee_code: String(mapped.employee_code) })
    if (conditions.length === 0) return null
    const found = await tx.guard.findFirst({ where: { companyId, OR: conditions } })
    return found as ImportRecord | null
  },
  async buildCreateData(mapped, companyId) {
    // employee_code is expected to already be present here -- prepareBatch
    // fills it in for every row in the job before buildCreateData is ever
    // called. force_number still uses the atomic per-company counter
    // (claimCounter/nextForceNumber), which is safe to call per row.
    const employee_code = String(mapped.employee_code ?? '')
    const force_number = mapped.force_number ? String(mapped.force_number) : await nextForceNumber(companyId)
    const fullName = String(mapped.full_name ?? '')
    const { first_name, last_name } = splitName(fullName)

    return {
      id: crypto.randomUUID(),
      companyId,
      employee_code,
      force_number,
      full_name: fullName,
      first_name,
      last_name,
      status: (mapped.status as string) || 'Active',
      ...pickDefined(mapped, [
        'national_id', 'phone', 'whatsapp', 'email', 'address', 'city', 'region', 'gender',
        'department', 'position', 'employee_type', 'date_of_birth', 'hire_date',
        'contract_start_date', 'contract_expiry_date', 'basic_salary', 'daily_rate',
        'bank_name', 'bank_account_number', 'ecocash_number', 'next_of_kin_name',
        'next_of_kin_phone', 'next_of_kin_relationship', 'notes',
      ]),
    }
  },
  buildUpdateData(mapped, existing) {
    const data = pickDefined(mapped, [
      'national_id', 'phone', 'whatsapp', 'email', 'address', 'city', 'region', 'gender',
      'department', 'position', 'employee_type', 'date_of_birth', 'hire_date',
      'contract_start_date', 'contract_expiry_date', 'basic_salary', 'daily_rate',
      'bank_name', 'bank_account_number', 'ecocash_number', 'next_of_kin_name',
      'next_of_kin_phone', 'next_of_kin_relationship', 'notes', 'status', 'employee_code', 'force_number',
    ])
    if (mapped.full_name) {
      const { first_name, last_name } = splitName(String(mapped.full_name))
      Object.assign(data, { full_name: mapped.full_name, first_name, last_name })
    }
    return data
  },
  async create(tx, data) {
    const guard = await tx.guard.create({ data: data as Prisma.GuardUncheckedCreateInput })
    return guard as ImportRecord
  },
  async update(tx, id, data) {
    const guard = await tx.guard.update({ where: { id }, data: data as Prisma.GuardUncheckedUpdateInput })
    return guard as ImportRecord
  },
  async remove(tx, id) {
    await tx.guard.delete({ where: { id } })
  },
  async listForExport(companyId) {
    const guards = await prisma.guard.findMany({ where: { companyId }, orderBy: { employee_code: 'asc' } })
    return guards as ImportRecord[]
  },
}

function pickDefined(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

const customersConfig: ModuleImportConfig = {
  moduleKey: 'customers',
  label: 'Customers',
  fields: [
    { key: 'company_name', label: 'Company Name', type: 'string', required: true },
    { key: 'customer_code', label: 'Customer Code', type: 'string', description: 'Leave blank to auto-generate' },
    { key: 'contact_person', label: 'Contact Person', type: 'string' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'phone', label: 'Phone', type: 'string' },
    { key: 'mobile', label: 'Mobile', type: 'string' },
    { key: 'billing_address', label: 'Billing Address', type: 'string' },
    { key: 'shipping_address', label: 'Shipping Address', type: 'string' },
    { key: 'city', label: 'City', type: 'string' },
    { key: 'country', label: 'Country', type: 'string' },
    { key: 'vat_number', label: 'VAT Number', type: 'string' },
    { key: 'payment_terms', label: 'Payment Terms (days)', type: 'number', example: 30 },
    { key: 'credit_limit', label: 'Credit Limit', type: 'number' },
    { key: 'opening_balance', label: 'Opening Balance', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'string', example: 'USD' },
    { key: 'risk_level', label: 'Risk Level', type: 'string' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  exportColumns: [
    { key: 'customer_code', label: 'Code' },
    { key: 'company_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'payment_terms', label: 'Payment Terms' },
    { key: 'credit_limit', label: 'Credit Limit' },
    { key: 'current_balance', label: 'Outstanding' },
  ],
  naturalKeyOf(mapped) {
    if (mapped.email) return `email:${normalizeKey(mapped.email)}`
    if (mapped.customer_code) return `code:${normalizeKey(mapped.customer_code)}`
    return null
  },
  async findExisting(tx, companyId, mapped) {
    const conditions: Prisma.CustomerWhereInput[] = []
    if (mapped.email) conditions.push({ email: String(mapped.email) })
    if (mapped.customer_code) conditions.push({ customer_code: String(mapped.customer_code) })
    if (conditions.length === 0) return null
    const found = await tx.customer.findFirst({ where: { companyId, OR: conditions } })
    return found as ImportRecord | null
  },
  async buildCreateData(mapped, companyId) {
    const customer_code = mapped.customer_code ? String(mapped.customer_code) : await nextCustomerNumber(companyId)
    return {
      id: crypto.randomUUID(),
      companyId,
      customer_code,
      is_active: true,
      current_balance: mapped.opening_balance ?? 0,
      ...pickDefined(mapped, [
        'company_name', 'contact_person', 'email', 'phone', 'mobile', 'billing_address',
        'shipping_address', 'city', 'country', 'vat_number', 'payment_terms', 'credit_limit',
        'opening_balance', 'currency', 'risk_level', 'notes',
      ]),
    }
  },
  buildUpdateData(mapped) {
    return pickDefined(mapped, [
      'company_name', 'contact_person', 'email', 'phone', 'mobile', 'billing_address',
      'shipping_address', 'city', 'country', 'vat_number', 'payment_terms', 'credit_limit',
      'currency', 'risk_level', 'notes', 'customer_code',
    ])
  },
  async create(tx, data) {
    const customer = await tx.customer.create({ data: data as Prisma.CustomerUncheckedCreateInput })
    return customer as ImportRecord
  },
  async update(tx, id, data) {
    const customer = await tx.customer.update({ where: { id }, data: data as Prisma.CustomerUncheckedUpdateInput })
    return customer as ImportRecord
  },
  async remove(tx, id) {
    await tx.customer.delete({ where: { id } })
  },
  async listForExport(companyId) {
    // current_balance is a denormalized cache that's gone stale for a
    // meaningful share of historically-imported customers (confirmed via a
    // live customer whose real outstanding balance from unpaid invoices
    // didn't match its current_balance) — export the same live sum used by
    // the customers list API instead of trusting the cached column.
    const [customers, balanceAggs] = await Promise.all([
      prisma.customer.findMany({ where: { companyId }, orderBy: { company_name: 'asc' } }),
      prisma.salesInvoice.groupBy({
        by: ['customer_id'],
        where: { companyId, status: { not: 'Void' } },
        _sum: { balance_due: true },
      }),
    ])
    const balanceMap = Object.fromEntries(balanceAggs.map((b) => [b.customer_id, Number(b._sum.balance_due ?? 0)]))
    return customers.map((c) => ({ ...c, current_balance: balanceMap[c.id] ?? 0 })) as ImportRecord[]
  },
}

const suppliersConfig: ModuleImportConfig = {
  moduleKey: 'suppliers',
  label: 'Suppliers',
  fields: [
    { key: 'company_name', label: 'Company Name', type: 'string', required: true },
    { key: 'supplier_code', label: 'Supplier Code', type: 'string', description: 'Leave blank to auto-generate' },
    { key: 'contact_person', label: 'Contact Person', type: 'string' },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'phone', label: 'Phone', type: 'string' },
    { key: 'mobile', label: 'Mobile', type: 'string' },
    { key: 'address', label: 'Address', type: 'string' },
    { key: 'city', label: 'City', type: 'string' },
    { key: 'country', label: 'Country', type: 'string' },
    { key: 'vat_number', label: 'VAT Number', type: 'string' },
    { key: 'payment_terms', label: 'Payment Terms (days)', type: 'number', example: 30 },
    { key: 'opening_balance', label: 'Opening Balance', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'string', example: 'USD' },
    { key: 'bank_name', label: 'Bank Name', type: 'string' },
    { key: 'bank_branch', label: 'Bank Branch', type: 'string' },
    { key: 'bank_account_number', label: 'Bank Account Number', type: 'string' },
    { key: 'withholding_tax_rate', label: 'Withholding Tax Rate (%)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  exportColumns: [
    { key: 'supplier_code', label: 'Code' },
    { key: 'company_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'payment_terms', label: 'Payment Terms' },
    { key: 'current_balance', label: 'Outstanding' },
  ],
  naturalKeyOf(mapped) {
    if (mapped.email) return `email:${normalizeKey(mapped.email)}`
    if (mapped.supplier_code) return `code:${normalizeKey(mapped.supplier_code)}`
    return null
  },
  async findExisting(tx, companyId, mapped) {
    const conditions: Prisma.SupplierWhereInput[] = []
    if (mapped.email) conditions.push({ email: String(mapped.email) })
    if (mapped.supplier_code) conditions.push({ supplier_code: String(mapped.supplier_code) })
    if (conditions.length === 0) return null
    const found = await tx.supplier.findFirst({ where: { companyId, OR: conditions } })
    return found as ImportRecord | null
  },
  async buildCreateData(mapped, companyId) {
    const supplier_code = mapped.supplier_code ? String(mapped.supplier_code) : await nextSupplierNumber(companyId)
    return {
      id: crypto.randomUUID(),
      companyId,
      supplier_code,
      is_active: true,
      current_balance: mapped.opening_balance ?? 0,
      ...pickDefined(mapped, [
        'company_name', 'contact_person', 'email', 'phone', 'mobile', 'address', 'city', 'country',
        'vat_number', 'payment_terms', 'opening_balance', 'currency', 'bank_name', 'bank_branch',
        'bank_account_number', 'withholding_tax_rate', 'notes',
      ]),
    }
  },
  buildUpdateData(mapped) {
    return pickDefined(mapped, [
      'company_name', 'contact_person', 'email', 'phone', 'mobile', 'address', 'city', 'country',
      'vat_number', 'payment_terms', 'currency', 'bank_name', 'bank_branch', 'bank_account_number',
      'withholding_tax_rate', 'notes', 'supplier_code',
    ])
  },
  async create(tx, data) {
    const supplier = await tx.supplier.create({ data: data as Prisma.SupplierUncheckedCreateInput })
    return supplier as ImportRecord
  },
  async update(tx, id, data) {
    const supplier = await tx.supplier.update({ where: { id }, data: data as Prisma.SupplierUncheckedUpdateInput })
    return supplier as ImportRecord
  },
  async remove(tx, id) {
    await tx.supplier.delete({ where: { id } })
  },
  async listForExport(companyId) {
    // Same denormalized-balance staleness as customersConfig above — export
    // the live sum of unpaid purchase invoice balances, not the cached column.
    const [suppliers, balanceAggs] = await Promise.all([
      prisma.supplier.findMany({ where: { companyId }, orderBy: { company_name: 'asc' } }),
      prisma.purchaseInvoice.groupBy({
        by: ['supplierId'],
        where: { companyId, status: { not: 'VOID' as any } },
        _sum: { balanceDue: true },
      }),
    ])
    const balanceMap = Object.fromEntries(balanceAggs.map((b) => [b.supplierId, Number(b._sum.balanceDue ?? 0)]))
    return suppliers.map((s) => ({ ...s, current_balance: balanceMap[s.id] ?? 0 })) as ImportRecord[]
  },
}

const sitesConfig: ModuleImportConfig = {
  moduleKey: 'sites',
  label: 'Sites',
  fields: [
    { key: 'site_name', label: 'Site Name', type: 'string', required: true },
    { key: 'site_code', label: 'Site Code', type: 'string', description: 'Leave blank to auto-generate' },
    { key: 'customer_name', label: 'Customer Name', type: 'string', description: 'Matched against existing customers by name' },
    { key: 'address', label: 'Address', type: 'string' },
    { key: 'city', label: 'City', type: 'string' },
    { key: 'contact_person', label: 'Contact Person', type: 'string' },
    { key: 'contact_phone', label: 'Contact Phone', type: 'string' },
    { key: 'day_shift_required', label: 'Day Shift Required', type: 'number' },
    { key: 'night_shift_required', label: 'Night Shift Required', type: 'number' },
    { key: 'billing_rate_day', label: 'Billing Rate (Day)', type: 'number' },
    { key: 'billing_rate_night', label: 'Billing Rate (Night)', type: 'number' },
    { key: 'risk_level', label: 'Risk Level', type: 'string' },
    { key: 'contract_start_date', label: 'Contract Start', type: 'date' },
    { key: 'contract_end_date', label: 'Contract End', type: 'date' },
    { key: 'status', label: 'Status', type: 'enum', enumValues: ['Active', 'Terminated'], example: 'Active' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  exportColumns: [
    { key: 'site_code', label: 'Code' },
    { key: 'site_name', label: 'Name' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'city', label: 'City' },
    { key: 'day_shift_required', label: 'Day Shift Req.' },
    { key: 'night_shift_required', label: 'Night Shift Req.' },
    { key: 'status', label: 'Status' },
  ],
  naturalKeyOf(mapped) {
    if (mapped.site_code) return `code:${normalizeKey(mapped.site_code)}`
    if (mapped.site_name) return `name:${normalizeKey(mapped.site_name)}`
    return null
  },
  async findExisting(tx, companyId, mapped) {
    const conditions: Prisma.SiteWhereInput[] = []
    if (mapped.site_code) conditions.push({ site_code: String(mapped.site_code) })
    if (mapped.site_name) conditions.push({ site_name: String(mapped.site_name) })
    if (conditions.length === 0) return null
    const found = await tx.site.findFirst({ where: { companyId, OR: conditions } })
    return found as ImportRecord | null
  },
  async buildCreateData(mapped, companyId) {
    const site_code = mapped.site_code ? String(mapped.site_code) : await nextSiteNumber(companyId)
    let customer_id: string | null = null
    if (mapped.customer_name) {
      const customer = await prisma.customer.findFirst({
        where: { companyId, company_name: { equals: String(mapped.customer_name), mode: 'insensitive' } },
      })
      customer_id = customer?.id ?? null
    }
    return {
      id: crypto.randomUUID(),
      companyId,
      site_code,
      customer_id,
      is_active: true,
      status: (mapped.status as string) || 'Active',
      ...pickDefined(mapped, [
        'site_name', 'customer_name', 'address', 'city', 'contact_person', 'contact_phone',
        'day_shift_required', 'night_shift_required', 'billing_rate_day', 'billing_rate_night',
        'risk_level', 'contract_start_date', 'contract_end_date', 'notes',
      ]),
    }
  },
  buildUpdateData(mapped) {
    return pickDefined(mapped, [
      'site_name', 'customer_name', 'address', 'city', 'contact_person', 'contact_phone',
      'day_shift_required', 'night_shift_required', 'billing_rate_day', 'billing_rate_night',
      'risk_level', 'contract_start_date', 'contract_end_date', 'status', 'site_code',
    ])
  },
  async create(tx, data) {
    const site = await tx.site.create({ data: data as Prisma.SiteUncheckedCreateInput })
    return site as ImportRecord
  },
  async update(tx, id, data) {
    const site = await tx.site.update({ where: { id }, data: data as Prisma.SiteUncheckedUpdateInput })
    return site as ImportRecord
  },
  async remove(tx, id) {
    await tx.site.delete({ where: { id } })
  },
  async listForExport(companyId) {
    const sites = await prisma.site.findMany({ where: { companyId }, orderBy: { site_name: 'asc' } })
    return sites as ImportRecord[]
  },
}

const registry: Record<string, ModuleImportConfig> = {
  employees: employeesConfig,
  customers: customersConfig,
  suppliers: suppliersConfig,
  sites: sitesConfig,
}

export function getModuleConfig(moduleKey: string): ModuleImportConfig {
  const config = registry[moduleKey]
  if (!config) throw new Error(`Unknown import/export module: ${moduleKey}`)
  return config
}

export function listModules(): ModuleImportConfig[] {
  return Object.values(registry)
}
