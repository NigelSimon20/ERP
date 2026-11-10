// P1-1 / P1-8 dry run for migration 20261110010000_money_decimal_18_2.
// Lists every stored money value that the migration would round, with the
// before/after value and the total drift per column. Read-only: it never
// writes. The migration itself does the rounding once approved.
//
//   node scripts/remediate/money-rounding.mjs --dry-run
//
// Uses DIRECT_URL. Run it against a column type that is still float or
// wide decimal (i.e. before the migration); afterwards it reports nothing.
import pg from 'pg'

if (!process.argv.includes('--dry-run')) {
  console.error('This script only supports --dry-run; the migration performs the change.')
  process.exit(2)
}
const COLUMNS = [["long_service_tiers", "amount"], ["customers", "credit_limit"], ["customers", "current_balance"], ["customers", "opening_balance"], ["suppliers", "current_balance"], ["suppliers", "opening_balance"], ["guards", "leave_daily_value"], ["guards", "leave_balance"], ["guards", "basic_salary"], ["equipment", "unit_cost"], ["equipment", "charge_amount"], ["proforma_invoices", "subtotal"], ["proforma_invoices", "taxAmount"], ["proforma_invoices", "totalAmount"], ["proforma_invoice_lines", "unitPrice"], ["proforma_invoice_lines", "lineTotal"], ["credit_notes", "subtotal"], ["credit_notes", "taxAmount"], ["credit_notes", "totalAmount"], ["credit_note_lines", "unitPrice"], ["credit_note_lines", "lineTotal"], ["debit_notes", "subtotal"], ["debit_notes", "taxAmount"], ["debit_notes", "totalAmount"], ["debit_note_lines", "unitPrice"], ["debit_note_lines", "lineTotal"], ["purchase_orders", "subtotal"], ["purchase_orders", "taxAmount"], ["purchase_orders", "totalAmount"], ["purchase_order_lines", "unitPrice"], ["purchase_order_lines", "lineTotal"], ["expense_claims", "amount"], ["chart_of_accounts", "current_balance"], ["chart_of_accounts", "opening_balance"], ["bank_accounts", "reconciled_balance"], ["bank_accounts", "current_balance"], ["bank_accounts", "opening_balance"], ["journal_entries", "total_credit"], ["journal_entries", "total_debit"], ["payments", "amount"], ["payslips", "net_pay"], ["payslips", "total_deductions"], ["payslips", "overtime_pay"], ["payslips", "total_contributions_employee"], ["payslips", "total_earnings"], ["payslips", "basic_salary"], ["payslips", "total_contributions_employer"], ["sales_invoices", "tax_amount"], ["sales_invoices", "amount_paid"], ["sales_invoices", "discount_amount"], ["sales_invoices", "total_amount"], ["sales_invoices", "subtotal"], ["sales_invoices", "balance_due"], ["invoice_line_items", "unitPrice"], ["invoice_line_items", "lineTotal"], ["purchase_invoices", "subtotal"], ["purchase_invoices", "taxAmount"], ["purchase_invoices", "totalAmount"], ["purchase_invoices", "paidAmount"], ["purchase_invoices", "balanceDue"], ["purchase_invoice_line_items", "unitPrice"], ["purchase_invoice_line_items", "subtotal"], ["purchase_invoice_line_items", "taxAmount"], ["purchase_invoice_line_items", "lineTotal"], ["journal_lines", "debit"], ["journal_lines", "credit"], ["bank_transfers", "amount"], ["receipts", "amount"], ["fixed_assets", "purchasePrice"], ["fixed_assets", "accumulatedDepreciation"], ["fixed_assets", "currentValue"], ["inventory_items", "unitCost"], ["inventory_items", "totalValue"], ["bank_reconciliations", "statementBalance"], ["bank_reconciliations", "bookBalance"], ["departments", "budget"], ["budgets", "budgetedAmount"], ["payslip_items", "fixedAmount"], ["payroll_runs", "totalGross"], ["payroll_runs", "totalDeductions"], ["payroll_runs", "totalNet"], ["payslip_lines", "amount"], ["leads", "estimatedValue"], ["quotations", "subtotal"], ["quotations", "tax"], ["quotations", "total"], ["quotation_items", "unitPrice"], ["quotation_items", "total"], ["contracts", "contractValue"]]

const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: process.env.DIRECT_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
await db.connect()
let rows = 0
console.log('table.column | rows changed | sum before | sum after | drift | examples (before -> after)')
for (const [table, column] of COLUMNS) {
  const q = `SELECT id, "${column}"::text AS before, round("${column}"::numeric, 2)::text AS after
             FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}"::numeric <> round("${column}"::numeric, 2)`
  const res = await db.query(q).catch((e) => ({ error: e.message }))
  if (res.error) { console.log(`${table}.${column} | ERROR ${res.error}`); continue }
  if (res.rows.length === 0) continue
  const sum = await db.query(`SELECT sum("${column}"::numeric)::text AS b, sum(round("${column}"::numeric, 2))::text AS a FROM "${table}"`)
  const { b, a } = sum.rows[0]
  const drift = (Number(a) - Number(b)).toFixed(6)
  const ex = res.rows.slice(0, 3).map((r) => `${r.before} -> ${r.after}`).join('; ')
  console.log(`${table}.${column} | ${res.rows.length} | ${b} | ${a} | ${drift} | ${ex}`)
  rows += res.rows.length
}
await db.end()
console.log(`\n${rows} value(s) would be rounded. Nothing was written.`)
