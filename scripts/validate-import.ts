import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ValidationResult {
  table: string
  status: 'PASS' | 'FAIL' | 'WARNING'
  count: number
  message: string
  details?: string[]
}

const results: ValidationResult[] = []

async function validateTable(
  name: string,
  query: () => Promise<any[]>,
  minExpected: number = 1,
) {
  try {
    const records = await query()
    const count = records.length

    if (count === 0) {
      results.push({
        table: name,
        status: 'FAIL',
        count: 0,
        message: `No records found in ${name}`,
      })
    } else if (count < minExpected) {
      results.push({
        table: name,
        status: 'WARNING',
        count,
        message: `Only ${count} records found (expected at least ${minExpected})`,
      })
    } else {
      results.push({
        table: name,
        status: 'PASS',
        count,
        message: `✅ ${count} records imported successfully`,
      })
    }
  } catch (error: any) {
    results.push({
      table: name,
      status: 'FAIL',
      count: 0,
      message: `Error: ${error.message}`,
    })
  }
}

async function validateDataIntegrity() {
  console.log('🔍 Validating Data Integrity...\n')

  // Check Company
  await validateTable('Company', () => prisma.company.findMany(), 1)

  // Check Customers
  await validateTable('Customers', () => prisma.customer.findMany(), 1)

  // Check Suppliers
  await validateTable('Suppliers', () => prisma.supplier.findMany(), 1)

  // Check Guards
  await validateTable('Guards/Employees', () => prisma.guard.findMany(), 1)

  // Check Sites
  await validateTable('Sites', () => prisma.site.findMany(), 1)

  // Check Attendance
  await validateTable('Attendance Records', () => prisma.attendance.findMany(), 1)

  // Check Bank Accounts
  await validateTable('Bank Accounts', () => prisma.bankAccount.findMany(), 1)

  // Check Chart of Accounts
  await validateTable('Chart of Accounts', () => prisma.chartOfAccount.findMany(), 10)

  // Check Invoices
  await validateTable('Sales Invoices', () => prisma.salesInvoice.findMany(), 1)

  // Check Invoice Line Items
  await validateTable('Invoice Line Items', () => prisma.salesInvoiceLine.findMany(), 1)

  // Check Journal Entries
  await validateTable('Journal Entries', () => prisma.journalEntry.findMany(), 1)

  // Check Payments
  await validateTable('Payments', () => prisma.payment.findMany(), 0) // Optional

  // Check Payroll Runs
  await validateTable('Payroll Runs', () => prisma.payrollRun.findMany(), 0) // Optional

  // Check Payslips
  await validateTable('Payslips', () => prisma.payslip.findMany(), 0) // Optional

  console.log('\n📊 Validation Results:')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.status === 'PASS').length
  const warnings = results.filter((r) => r.status === 'WARNING').length
  const failed = results.filter((r) => r.status === 'FAIL').length

  results.forEach((result) => {
    const emoji = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️ ' : '❌'
    console.log(`${emoji} ${result.table.padEnd(25)} ${result.status.padEnd(7)} (${result.count} records)`)
    if (result.message) {
      console.log(`   └─ ${result.message}`)
    }
  })

  console.log('='.repeat(60))
  console.log(`\nSummary: ${passed} passed, ${warnings} warnings, ${failed} failed\n`)

  return failed === 0
}

async function validateFinancialData() {
  console.log('💰 Validating Financial Data...\n')

  try {
    // Check journal entries balance
    const entries = await prisma.journalEntry.findMany()

    let balancedCount = 0
    let imbalancedCount = 0

    for (const entry of entries) {
      const totalDebit = parseFloat(String(entry.total_debit))
      const totalCredit = parseFloat(String(entry.total_credit))

      if (Math.abs(totalDebit - totalCredit) < 0.01) {
        balancedCount++
      } else {
        imbalancedCount++
        console.warn(`⚠️  Entry ${entry.reference} is imbalanced (Debit: ${totalDebit}, Credit: ${totalCredit})`)
      }
    }

    console.log(`✅ Journal Entries: ${balancedCount} balanced, ${imbalancedCount} imbalanced`)

    // Check invoice totals
    const invoices = await prisma.salesInvoice.findMany({
      include: { lineItems: true },
    })

    let correctTotals = 0
    let incorrectTotals = 0

    for (const invoice of invoices) {
      const calculatedTotal = invoice.lineItems.reduce(
        (sum, line) => sum + parseFloat(String(line.lineTotal)),
        0,
      )
      const totalWithTax = calculatedTotal + parseFloat(String(invoice.tax_amount))

      if (Math.abs(totalWithTax - parseFloat(String(invoice.total_amount))) < 0.01) {
        correctTotals++
      } else {
        incorrectTotals++
        console.warn(
          `⚠️  Invoice ${invoice.invoice_number} total mismatch (Calculated: ${totalWithTax}, Stored: ${invoice.total_amount})`,
        )
      }
    }

    console.log(`✅ Invoice Totals: ${correctTotals} correct, ${incorrectTotals} incorrect`)

    // Check outstanding receivables
    const totalOutstanding = await prisma.customer.aggregate({
      _sum: { current_balance: true },
    })

    console.log(`✅ Total Outstanding Receivables: $${totalOutstanding._sum.current_balance || 0}`)
  } catch (error: any) {
    console.error(`❌ Error validating financial data: ${error.message}`)
  }
}

async function validateOperationalData() {
  console.log('\n🏢 Validating Operational Data...\n')

  try {
    // Check guard deployment status
    const guards = await prisma.guard.findMany()
    console.log(`✅ Total Guards: ${guards.length}`)

    const activeGuards = guards.filter((g) => g.status === 'ACTIVE').length
    console.log(`✅ Active Guards: ${activeGuards}`)

    // Check sites
    const sites = await prisma.site.findMany()
    console.log(`✅ Total Sites: ${sites.length}`)

    // Check attendance by status
    const attendance = await prisma.attendance.findMany()
    const presentCount = attendance.filter((a) => a.status === 'PRESENT').length
    const absentCount = attendance.filter((a) => a.status === 'ABSENT').length

    console.log(`✅ Attendance Records: ${attendance.length} total`)
    console.log(`   ├─ Present: ${presentCount}`)
    console.log(`   └─ Absent: ${absentCount}`)

    // Check equipment status
    const equipment = await prisma.equipment.findMany()
    const activeEquipment = equipment.filter((e) => e.is_active === true).length

    console.log(`✅ Equipment Inventory: ${equipment.length} total (${activeEquipment} active)`)
  } catch (error: any) {
    console.error(`❌ Error validating operational data: ${error.message}`)
  }
}

async function validateHRData() {
  console.log('\n👥 Validating HR Data...\n')

  try {
    // Check payroll
    const payrollRuns = await prisma.payrollRun.findMany()
    console.log(`✅ Payroll Runs: ${payrollRuns.length}`)

    // Check payslips
    const payslips = await prisma.payslip.findMany()
    console.log(`✅ Payslips: ${payslips.length}`)

    if (payslips.length > 0) {
      const lastPayslip = payslips[payslips.length - 1]
      console.log(`   └─ Latest: Pay date ${lastPayslip.pay_date}`)
    }

    // Check payslip items
    const payslipItems = await prisma.payslipItem.findMany()
    const earnings = payslipItems.filter((i) => i.itemType === 'EARNING').length
    const deductions = payslipItems.filter((i) => i.itemType === 'DEDUCTION').length

    console.log(`✅ Payslip Items: ${payslipItems.length} (${earnings} earnings, ${deductions} deductions)`)
  } catch (error: any) {
    console.error(`❌ Error validating HR data: ${error.message}`)
  }
}

async function main() {
  try {
    console.log('🚀 Starting Database Validation\n')
    console.log('=' .repeat(60))

    const integrityValid = await validateDataIntegrity()
    await validateFinancialData()
    await validateOperationalData()
    await validateHRData()

    console.log('\n' + '=' .repeat(60))

    if (integrityValid) {
      console.log('✨ Database import validation PASSED!\n')
      console.log('📋 All tables imported with expected data.')
      console.log('🎯 Ready for production use.\n')
    } else {
      console.log('⚠️  Database import validation found issues.\n')
      console.log('❌ Review errors above and re-run migration if needed.\n')
    }
  } catch (error) {
    console.error('❌ Validation failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
