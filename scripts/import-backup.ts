import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

interface BackupData {
  settings: any[]
  chartOfAccounts: any[]
  customers: any[]
  employees: any[]
  equipment: any[]
  invoices: any[]
  journalEntries: any[]
  payments: any[]
  payslips: any[]
  sites: any[]
  suppliers: any[]
  attendance: any[]
  bankAccounts: any[]
  exportDate: string
}

const prisma = new PrismaClient()

// Helper to generate CUID-like IDs
function generateId(): string {
  return 'c' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Map backup data field names to Prisma field names
function mapField(value: any, fieldType: string): any {
  if (value === null || value === undefined) return null
  if (value === '') return null
  
  switch (fieldType) {
    case 'Decimal':
      return parseFloat(String(value)) || 0
    case 'DateTime':
      if (typeof value === 'string') return new Date(value).toISOString()
      if (typeof value === 'number') return new Date(value).toISOString()
      return new Date().toISOString()
    case 'Int':
      return parseInt(String(value)) || 0
    case 'Boolean':
      return value === true || value === 'true' || value === 1
    default:
      return value
  }
}

async function importSettings(settings: any[]) {
  if (!settings || settings.length === 0) {
    console.log('No settings to import')
    return
  }

  const setting = settings[0]
  console.log('⚙️  Importing company settings...')

  try {
    // Create or update company
    const company = await prisma.company.upsert({
      where: { id: setting.id || 'default-company' },
      update: {
        name: setting.company_name || 'Ravenshield Security',
        email: setting.email || 'info@ravenshield.co.zw',
        phone: setting.phone,
        address: setting.address,
        logo: setting.logo_url,
        currency: setting.default_currency || 'USD',
        fiscalYearStart: setting.fiscal_year_start || '01-01',
        defaultVatRate: mapField(setting.default_vat_rate, 'Decimal'),
      },
      create: {
        id: setting.id || 'default-company',
        name: setting.company_name || 'Ravenshield Security',
        email: setting.email || 'info@ravenshield.co.zw',
        phone: setting.phone,
        address: setting.address,
        logo: setting.logo_url,
        currency: setting.default_currency || 'USD',
        fiscalYearStart: setting.fiscal_year_start || '01-01',
        defaultVatRate: mapField(setting.default_vat_rate, 'Decimal'),
      },
    })

    console.log(`✅ Company settings imported: ${company.name}`)
  } catch (error) {
    console.error('❌ Error importing settings:', error)
  }
}

async function importChartOfAccounts(accounts: any[], companyId: string) {
  if (!accounts || accounts.length === 0) {
    console.log('No chart of accounts to import')
    return
  }

  console.log(`📊 Importing ${accounts.length} chart of accounts...`)
  let imported = 0
  let failed = 0

  for (const account of accounts) {
    try {
      // Map account_type to AccountType enum
      const typeMap: Record<string, string> = {
        Asset: 'ASSET',
        Liability: 'LIABILITY',
        Equity: 'EQUITY',
        Revenue: 'REVENUE',
        Expense: 'EXPENSE',
        Suspense: 'ASSET',
      }

      const existingAccount = await prisma.chartOfAccount.findFirst({
        where: { account_code: account.account_code, companyId },
      })

      if (existingAccount) {
        await prisma.chartOfAccount.update({
          where: { id: existingAccount.id },
          data: {
            account_name: account.account_name,
            current_balance: mapField(account.current_balance || account.opening_balance, 'Decimal'),
            is_active: account.is_active !== false,
            currency: account.currency || 'USD',
          },
        })
      } else {
        await prisma.chartOfAccount.create({
          data: {
            id: generateId(),
            companyId,
            account_code: account.account_code,
            account_name: account.account_name,
            account_type: typeMap[account.account_type] || 'ASSET',
            parent_account_id: null,
            current_balance: mapField(account.current_balance || account.opening_balance, 'Decimal'),
            currency: account.currency || 'USD',
            is_active: account.is_active !== false,
          },
        })
      }
      imported++
    } catch (error) {
      console.error(`Failed to import account ${account.account_code}:`, error)
      failed++
    }
  }

  console.log(`✅ Chart of Accounts: ${imported} imported, ${failed} failed`)
}

async function importCustomers(customers: any[], companyId: string) {
  if (!customers || customers.length === 0) {
    console.log('No customers to import')
    return
  }

  console.log(`👥 Importing ${customers.length} customers...`)
  let imported = 0
  let failed = 0

  for (const customer of customers) {
    try {
      await prisma.customer.upsert({
        where: { id: customer.id },
        update: {
          company_name: customer.name,
          email: customer.email,
          phone: customer.phone,
          billing_address: customer.address,
          payment_terms: customer.payment_terms || 30,
          credit_limit: mapField(customer.credit_limit, 'Decimal'),
          current_balance: mapField(customer.outstanding_balance, 'Decimal'),
        },
        create: {
          id: customer.id || generateId(),
          companyId,
          company_name: customer.name,
          email: customer.email,
          phone: customer.phone,
          billing_address: customer.address,
          payment_terms: customer.payment_terms || 30,
          credit_limit: mapField(customer.credit_limit, 'Decimal'),
          current_balance: mapField(customer.outstanding_balance, 'Decimal'),
        },
      })
      imported++
    } catch (error) {
      console.error(`Failed to import customer ${customer.name}:`, error)
      failed++
    }
  }

  console.log(`✅ Customers: ${imported} imported, ${failed} failed`)
}

async function importSuppliers(suppliers: any[], companyId: string) {
  if (!suppliers || suppliers.length === 0) {
    console.log('No suppliers to import')
    return
  }

  console.log(`📦 Importing ${suppliers.length} suppliers...`)
  let imported = 0
  let failed = 0

  for (const supplier of suppliers) {
    try {
      await prisma.supplier.upsert({
        where: { id: supplier.id },
        update: {
          company_name: supplier.name,
          email: supplier.email,
          phone: supplier.phone,
          address: supplier.address,
          payment_terms: supplier.payment_terms || 30,
          current_balance: mapField(supplier.outstanding_balance, 'Decimal'),
        },
        create: {
          id: supplier.id || generateId(),
          companyId,
          company_name: supplier.name,
          email: supplier.email,
          phone: supplier.phone,
          address: supplier.address,
          payment_terms: supplier.payment_terms || 30,
          current_balance: mapField(supplier.outstanding_balance, 'Decimal'),
        },
      })
      imported++
    } catch (error) {
      console.error(`Failed to import supplier ${supplier.name}:`, error)
      failed++
    }
  }

  console.log(`✅ Suppliers: ${imported} imported, ${failed} failed`)
}

async function importEmployees(employees: any[], companyId: string) {
  if (!employees || employees.length === 0) {
    console.log('No employees to import')
    return
  }

  console.log(`👨‍💼 Importing ${employees.length} employees as guards...`)
  let imported = 0
  let failed = 0

  for (const emp of employees) {
    try {
      await prisma.guard.upsert({
        where: { id: emp.id || generateId() },
        update: {
          full_name: emp.name,
          phone: emp.phone,
          email: emp.email,
          department: emp.department,
          position: emp.rank,
          hire_date: mapField(emp.hire_date, 'DateTime'),
          basic_salary: mapField(emp.basic_salary, 'Decimal'),
          bank_account_number: emp.bank_account,
          bank_name: emp.bank_name,
          status: emp.status === 'active' ? 'Active' : 'Terminated',
        },
        create: {
          id: emp.id || generateId(),
          companyId: companyId,
          employee_code: emp.employee_number || emp.id || generateId(),
          full_name: emp.name,
          national_id: emp.id_number || emp.id || generateId(),
          phone: emp.phone || '000-0000',
          email: emp.email,
          department: emp.department,
          position: emp.rank,
          hire_date: mapField(emp.hire_date, 'DateTime') || new Date().toISOString(),
          basic_salary: mapField(emp.basic_salary, 'Decimal'),
          bank_account_number: emp.bank_account,
          bank_name: emp.bank_name,
          status: emp.status === 'active' ? 'Active' : 'Terminated',
        },
      })
      imported++
    } catch (error) {
      console.error(`Failed to import employee ${emp.name}:`, error)
      failed++
    }
  }

  console.log(`✅ Employees/Guards: ${imported} imported, ${failed} failed`)
}

async function importSites(sites: any[], companyId: string) {
  if (!sites || sites.length === 0) {
    console.log('No sites to import')
    return
  }

  console.log(`🏢 Importing ${sites.length} sites...`)
  let imported = 0
  let failed = 0

  for (const site of sites) {
    try {
      await prisma.site.upsert({
        where: { id: site.id },
        update: {
          site_name: site.name,
          address: site.address,
          contract_start_date: mapField(site.contract_start, 'DateTime'),
          contract_end_date: mapField(site.contract_end, 'DateTime'),
          day_shift_required: site.guards_required || 1,
          status: site.status?.toUpperCase() || 'ACTIVE',
          notes: site.notes,
        },
        create: {
          id: site.id || generateId(),
          companyId,
          site_name: site.name,
          address: site.address,
          contract_start_date: mapField(site.contract_start, 'DateTime'),
          contract_end_date: mapField(site.contract_end, 'DateTime'),
          day_shift_required: site.guards_required || 1,
          status: site.status?.toUpperCase() || 'ACTIVE',
          notes: site.notes,
        },
      })
      imported++
    } catch (error) {
      console.error(`Failed to import site ${site.name}:`, error)
      failed++
    }
  }

  console.log(`✅ Sites: ${imported} imported, ${failed} failed`)
}

async function importAttendance(attendance: any[]) {
  if (!attendance || attendance.length === 0) {
    console.log('No attendance records to import')
    return
  }

  console.log(`📅 Importing ${attendance.length} monthly attendance records...`)
  let imported = 0
  let failed = 0

  // Get a fallback site for records without a site_id
  const anySite = await prisma.site.findFirst()
  const fallbackSiteId = anySite?.id

  for (const monthRecord of attendance) {
    const guardId = monthRecord.employee_id
    const year = monthRecord.year
    const month = monthRecord.month
    const siteId = monthRecord.site_id || fallbackSiteId
    if (!guardId || !siteId || !year || !month) { failed++; continue }

    const dailyRecords: any[] = monthRecord.daily_records || []
    for (const dayRecord of dailyRecords) {
      if (!dayRecord.status || dayRecord.status === '') continue
      const day = dayRecord.day
      const date = new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00.000Z`)
      const statusMap: Record<string, string> = {
        'Present': 'PRESENT', 'Absent': 'ABSENT', 'Off': 'OFF',
        'Leave': 'LEAVE', 'Sick': 'SICK', 'Induction Unpaid': 'PRESENT', 'Induction Paid': 'PRESENT',
      }
      const status = (statusMap[dayRecord.status] || 'PRESENT') as any
      try {
        await prisma.attendance.upsert({
          where: { guardId_date: { guardId, date } },
          update: { hoursWorked: dayRecord.hours_worked || 0, status, notes: dayRecord.notes ?? null },
          create: {
            id: generateId(),
            guardId,
            siteId,
            date,
            hoursWorked: dayRecord.hours_worked || 0,
            status,
            notes: dayRecord.notes ?? null,
          },
        })
        imported++
      } catch {
        failed++
      }
    }
  }

  console.log(`✅ Attendance: ${imported} imported, ${failed} failed`)
}

async function importBankAccounts(accounts: any[], companyId: string) {
  if (!accounts || accounts.length === 0) {
    console.log('No bank accounts to import')
    return
  }

  console.log(`🏦 Importing ${accounts.length} bank accounts...`)
  let imported = 0
  let failed = 0

  for (const account of accounts) {
    try {
      await prisma.bankAccount.upsert({
        where: { id: account.id },
        update: {
          bank_name: account.bank_name,
          account_number: account.account_number,
          account_type: account.account_type,
          currency: account.currency || 'USD',
          opening_balance: mapField(account.opening_balance, 'Decimal'),
          current_balance: mapField(account.current_balance, 'Decimal'),
          is_active: account.active !== false,
        },
        create: {
          id: account.id || generateId(),
          companyId,
          bank_name: account.bank_name,
          account_number: account.account_number,
          account_type: account.account_type,
          currency: account.currency || 'USD',
          opening_balance: mapField(account.opening_balance, 'Decimal'),
          current_balance: mapField(account.current_balance, 'Decimal'),
          is_active: account.active !== false,
        },
      })
      imported++
    } catch (error) {
      console.error(`Failed to import bank account ${account.account_number}:`, error)
      failed++
    }
  }

  console.log(`✅ Bank Accounts: ${imported} imported, ${failed} failed`)
}

async function importInvoices(invoices: any[], companyId: string) {
  if (!invoices || invoices.length === 0) {
    console.log('No invoices to import')
    return
  }

  console.log(`💳 Importing ${invoices.length} invoices...`)
  let imported = 0
  let failed = 0

  for (const inv of invoices) {
    try {
      const lineItems = inv.line_items || inv.lineItems || []
      
      await prisma.salesInvoice.upsert({
        where: { id: inv.id || generateId() },
        update: {
          due_date: mapField(inv.due_date, 'DateTime'),
          subtotal: mapField(inv.subtotal, 'Decimal'),
          tax_amount: mapField(inv.tax_amount, 'Decimal'),
          total_amount: mapField(inv.total_amount, 'Decimal'),
          amount_paid: mapField(inv.paid_amount, 'Decimal'),
          balance_due: mapField(inv.balance_due, 'Decimal'),
          status: inv.status?.toUpperCase() || 'UNPAID',
          notes: inv.notes,
        },
        create: {
          id: inv.id || generateId(),
          companyId,
          customer_id: inv.customer_id || generateId(),
          reference: inv.invoice_number,
          invoice_date: mapField(inv.issue_date, 'DateTime') || new Date().toISOString(),
            due_date: mapField(inv.due_date, 'DateTime') || new Date().toISOString(),
          subtotal: mapField(inv.subtotal, 'Decimal'),
          tax_amount: mapField(inv.tax_amount, 'Decimal'),
          total_amount: mapField(inv.total_amount, 'Decimal'),
          amount_paid: mapField(inv.paid_amount, 'Decimal'),
          balance_due: mapField(inv.balance_due, 'Decimal'),
          status: inv.status?.toUpperCase() || 'UNPAID',
          notes: inv.notes,
          lineItems: {
            create: lineItems.map((line: any) => ({
              id: generateId(),
              description: line.description,
              quantity: mapField(line.quantity, 'Decimal'),
              unitPrice: mapField(line.unit_price, 'Decimal'),
              taxRate: mapField(line.tax_rate, 'Decimal'),
              lineTotal: mapField(line.line_total, 'Decimal'),
            })),
          },
        },
      })
      imported++
    } catch (error) {
      console.error(`Failed to import invoice ${inv.invoice_number}:`, error)
      failed++
    }
  }

  console.log(`✅ Invoices: ${imported} imported, ${failed} failed`)
}

async function main() {
  try {
    console.log('🚀 Starting database import from backup...\n')

    // Read backup file
    const backupPath = path.join(process.cwd(), 'db-backup', 'ravenshield_backup.json')
    const backupContent = fs.readFileSync(backupPath, 'utf-8')
    const data: BackupData = JSON.parse(backupContent)

    // Get the real company ID from DB after settings import
    const settingId = data.settings?.[0]?.id
    const company = settingId
      ? await prisma.company.findUnique({ where: { id: settingId } })
      : await prisma.company.findFirst()
    const companyId = company?.id || settingId || 'default-company'
    console.log(`Using companyId: ${companyId}`)

    await importSettings(data.settings)
    await importChartOfAccounts(data.chartOfAccounts, companyId)
    await importCustomers(data.customers, companyId)
    await importSuppliers(data.suppliers, companyId)

    await importEmployees(data.employees, companyId)
    await importSites(data.sites, companyId)
    await importAttendance(data.attendance)
    await importBankAccounts(data.bankAccounts, companyId)
    await importInvoices(data.invoices, companyId)

    console.log('\n✨ Database import completed successfully!')
  } catch (error) {
    console.error('❌ Error during import:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
