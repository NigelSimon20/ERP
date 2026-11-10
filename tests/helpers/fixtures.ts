import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'

const id = () => crypto.randomUUID()

// One self-contained tenant: users per role, a guard, a site, a customer,
// a supplier and the GL accounts that posting routes require.
export async function seedCompany(label = 'Test Co') {
  const companyId = id()
  const acct = (code: string, name: string, type: string) => ({
    id: id(), companyId, account_code: code, account_name: name, account_type: type, is_active: true, currency: 'USD',
  })
  const accounts = {
    bank: acct('1000', 'Bank', 'ASSET'),
    receivables: acct('1100', 'Accounts Receivable', 'ASSET'),
    payables: acct('2000', 'Accounts Payable', 'LIABILITY'),
    vat: acct('2100', 'VAT Payable', 'LIABILITY'),
    revenue: acct('4000', 'Guarding Revenue', 'REVENUE'),
    expense: acct('5000', 'General Expenses', 'EXPENSE'),
  }

  await prisma.company.create({ data: { id: companyId, name: label } })
  await prisma.chartOfAccount.createMany({ data: Object.values(accounts) })
  await prisma.company.update({
    where: { id: companyId },
    data: { receivablesAccountId: accounts.receivables.id, payablesAccountId: accounts.payables.id, vatAccountId: accounts.vat.id },
  })

  const password = await hashPassword('Correct-horse-1')
  const mkUser = (role: string) => ({
    id: id(), companyId, name: `${label} ${role}`, email: `${role.toLowerCase()}.${companyId.slice(0, 8)}@test.local`, password, role,
  })
  const users = {
    admin: mkUser('SUPER_ADMIN'),
    finance: mkUser('FINANCE_MANAGER'),
    ops: mkUser('OPERATIONS_MANAGER'),
    hr: mkUser('HR_MANAGER'),
  }
  await prisma.user.createMany({ data: Object.values(users) })

  const guard = { id: id(), companyId, full_name: 'Tendai Moyo', employee_code: 'EMP-0001', employee_type: 'Guard', status: 'Active' as const }
  const inactiveGuard = { id: id(), companyId, full_name: 'Former Guard', employee_code: 'EMP-0002', status: 'Resigned' as const }
  await prisma.guard.createMany({ data: [guard, inactiveGuard] })

  const site = { id: id(), companyId, site_name: 'Main Gate', status: 'Active' as const, is_active: true }
  await prisma.site.create({ data: site })
  const customer = { id: id(), companyId, company_name: 'Acme Holdings', is_active: true, currency: 'USD' }
  await prisma.customer.create({ data: customer })
  const supplier = { id: id(), companyId, company_name: 'Uniform Supplies', is_active: true, currency: 'USD' }
  await prisma.supplier.create({ data: supplier })
  const bankAccount = { id: id(), companyId, account_name: 'CBZ USD', bank_name: 'CBZ', chart_account_id: accounts.bank.id, currency: 'USD', current_balance: 0, is_active: true }
  await prisma.bankAccount.create({ data: bankAccount })

  const sessionFor = (u: (typeof users)[keyof typeof users]) => ({
    userId: u.id, companyId, role: u.role, name: u.name, email: u.email,
  })
  return { companyId, accounts, users, guard, inactiveGuard, site, customer, supplier, bankAccount, sessionFor }
}

export type Fixture = Awaited<ReturnType<typeof seedCompany>>
