-- P1-1: every money column becomes DECIMAL(18,2).
--
-- CHANGES EXISTING DATA: Postgres rounds each stored value to 2 dp (half
-- away from zero) during the type change, e.g. 139066.26078634209 ->
-- 139066.26, 585.585 -> 585.59. OWNER APPROVAL REQUIRED before this runs
-- against production. Preview the exact changes first with:
--   node scripts/remediate/money-rounding.mjs --dry-run
-- Quantities, rates, hours and days are not money and are left as they are.

-- AlterTable
ALTER TABLE "long_service_tiers" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "credit_limit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "current_balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "opening_balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "suppliers" ALTER COLUMN "current_balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "opening_balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "guards" ALTER COLUMN "leave_daily_value" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "leave_balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "basic_salary" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "equipment" ALTER COLUMN "unit_cost" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "charge_amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "proforma_invoices" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "proforma_invoice_lines" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "credit_notes" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "credit_note_lines" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "debit_notes" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "debit_note_lines" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "purchase_orders" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "purchase_order_lines" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "expense_claims" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "chart_of_accounts" ALTER COLUMN "current_balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "opening_balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "bank_accounts" ALTER COLUMN "reconciled_balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "current_balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "opening_balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "journal_entries" ALTER COLUMN "total_credit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total_debit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payslips" ALTER COLUMN "net_pay" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total_deductions" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "overtime_pay" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total_contributions_employee" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total_earnings" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "basic_salary" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total_contributions_employer" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "sales_invoices" ALTER COLUMN "tax_amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "amount_paid" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discount_amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "balance_due" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "invoice_line_items" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "purchase_invoices" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "balanceDue" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "purchase_invoice_line_items" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "lineTotal" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "journal_lines" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "bank_transfers" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "receipts" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "fixed_assets" ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "accumulatedDepreciation" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "currentValue" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "inventory_items" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalValue" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "bank_reconciliations" ALTER COLUMN "statementBalance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "bookBalance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "budget" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "budgets" ALTER COLUMN "budgetedAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payslip_items" ALTER COLUMN "fixedAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payroll_runs" ALTER COLUMN "totalGross" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalDeductions" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalNet" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payslip_lines" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "estimatedValue" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "quotations" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "quotation_items" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "contractValue" SET DATA TYPE DECIMAL(18,2);

