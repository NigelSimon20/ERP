-- RavenShield upgrade for the Phase 0 + Phase 1 release (fix/phase-1).
-- Paste the whole file into Supabase -> SQL Editor and click Run, once.
-- All or nothing: if any statement fails, nothing is changed.
--
-- Note: money columns become DECIMAL(18,2), so stored values are rounded
-- to 2 decimal places (e.g. 585.585 -> 585.59).
-- If this fails on a sales_invoices or payments unique index, the database
-- already holds duplicate document numbers: send me the error.

BEGIN;

-- ===== 20261110000000_add_user_password_changed_at
-- Additive only: existing rows get NULL, which means "no reset yet".
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- ===== 20261110010000_money_decimal_18_2
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


-- ===== 20261110020000_add_idempotency_keys
-- Additive: a new table only.
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_keys_companyId_route_key_key" ON "idempotency_keys"("companyId", "route", "key");
-- Every public table needs RLS (see 20261027000100_enable_rls).
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;

-- ===== 20261110030000_unique_document_numbers
-- P1-5 (BUG-008): document numbers are unique per company.
--
-- FAILS while duplicates exist (the audit found REC00037 x6, INV00008 x4,
-- PINV00006 x6 ...). OWNER APPROVAL REQUIRED: an accountant reviews
--   node scripts/remediate/duplicate-documents.mjs --dry-run
-- and the duplicates are renumbered before this runs in production.
CREATE UNIQUE INDEX "payments_companyId_payment_number_key" ON "payments"("companyId", "payment_number") WHERE "payment_number" IS NOT NULL;
CREATE UNIQUE INDEX "sales_invoices_companyId_invoice_number_key" ON "sales_invoices"("companyId", "invoice_number") WHERE "invoice_number" IS NOT NULL;

-- ===== 20261110040000_audit_trail_append_only
-- P1-9: richer, append-only audit trail. Additive: new nullable columns, an
-- index and a trigger; existing rows are untouched.
ALTER TABLE "audit_trail" ADD COLUMN "userAgent" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "changes" JSONB;

CREATE INDEX "audit_trail_companyId_createdAt_idx" ON "audit_trail"("companyId", "createdAt");

-- Grants can't restrict the table owner (which the app connects as), so a
-- trigger enforces append-only for every role.
CREATE OR REPLACE FUNCTION audit_trail_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_trail is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_trail_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "audit_trail"
  FOR EACH ROW EXECUTE FUNCTION audit_trail_append_only();

-- Maker-checker threshold (NULL = off).
ALTER TABLE "companies" ADD COLUMN "approval_threshold" DECIMAL(18,2);

-- ===== 20261110050000_payroll_basis_and_statutory_tables
-- P1-10. Additive: two columns and a new table.
ALTER TABLE "guards" ADD COLUMN "pay_basis" TEXT;
ALTER TABLE "companies" ADD COLUMN "default_pay_basis" TEXT NOT NULL DEFAULT 'DAILY';

CREATE TABLE "statutory_tables" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "config" JSONB NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statutory_tables_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "statutory_tables_companyId_kind_effectiveFrom_idx" ON "statutory_tables"("companyId", "kind", "effectiveFrom");
ALTER TABLE "statutory_tables" ENABLE ROW LEVEL SECURITY;

-- ===== 20261110060000_document_numbers_unique_per_company
-- Document numbers were unique across ALL tenants, so a second company's
-- first credit note (CRN-000001) collided with another company's. Unique per
-- company instead. Only relaxes a constraint: no data changes, cannot fail.
-- DropIndex
DROP INDEX "contracts_contractNumber_key";

-- DropIndex
DROP INDEX "credit_notes_creditNoteNumber_key";

-- DropIndex
DROP INDEX "debit_notes_debitNoteNumber_key";

-- DropIndex
DROP INDEX "expense_claims_claimNumber_key";

-- DropIndex
DROP INDEX "goods_received_notes_grnNumber_key";

-- DropIndex
DROP INDEX "proforma_invoices_proformaNumber_key";

-- DropIndex
DROP INDEX "purchase_invoices_invoiceNumber_key";

-- DropIndex
DROP INDEX "purchase_orders_poNumber_key";

-- DropIndex
DROP INDEX "quotations_quoteNumber_key";

-- DropIndex
DROP INDEX "receipts_reference_key";

-- CreateIndex
CREATE UNIQUE INDEX "contracts_companyId_contractNumber_key" ON "contracts"("companyId", "contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_companyId_creditNoteNumber_key" ON "credit_notes"("companyId", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_companyId_debitNoteNumber_key" ON "debit_notes"("companyId", "debitNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "expense_claims_companyId_claimNumber_key" ON "expense_claims"("companyId", "claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "goods_received_notes_companyId_grnNumber_key" ON "goods_received_notes"("companyId", "grnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_companyId_proformaNumber_key" ON "proforma_invoices"("companyId", "proformaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_companyId_invoiceNumber_key" ON "purchase_invoices"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_companyId_poNumber_key" ON "purchase_orders"("companyId", "poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_companyId_quoteNumber_key" ON "quotations"("companyId", "quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_companyId_reference_key" ON "receipts"("companyId", "reference");


-- ===== 20261110070000_fixed_asset_gl_mappings
-- P1-11. Additive: nullable columns only.
ALTER TABLE "companies" ADD COLUMN "fixed_assets_account_id" TEXT,
ADD COLUMN "accumulated_depreciation_account_id" TEXT,
ADD COLUMN "depreciation_expense_account_id" TEXT,
ADD COLUMN "inventory_account_id" TEXT;
ALTER TABLE "fixed_assets" ADD COLUMN "lastDepreciatedPeriod" TEXT;

INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES
  (gen_random_uuid()::text, 'bdd19c8044abd2e6f297f286304ef5ea002573ef1a3f020b6e13eaeca3ae738e', now(), '20261110000000_add_user_password_changed_at', 1),
  (gen_random_uuid()::text, 'a65b327f4814c7c47c18b947635e7d3e21f0927a36c8c213198185403f3cf2f7', now(), '20261110010000_money_decimal_18_2', 1),
  (gen_random_uuid()::text, '9c68981613d2cbd871fa590a7765c008a1b273bff3c80730a6637b40b1d85c4d', now(), '20261110020000_add_idempotency_keys', 1),
  (gen_random_uuid()::text, 'b25dc023da5cd656902d3e1f97e43d905011eca68046f87a3bd7b2c5a3b471bf', now(), '20261110030000_unique_document_numbers', 1),
  (gen_random_uuid()::text, '1c7de10ebd332236d9c06c697a2c711c23f06c711ca46f7ca2954731b40b4472', now(), '20261110040000_audit_trail_append_only', 1),
  (gen_random_uuid()::text, 'e6a8a8c8dc859d5440d568c6341d22ad36234276a3424a7785145f9a043653ae', now(), '20261110050000_payroll_basis_and_statutory_tables', 1),
  (gen_random_uuid()::text, '45c681d3516a934c4fd7a615c4f653d697837d10fdd3d32d9882c82ef329d516', now(), '20261110060000_document_numbers_unique_per_company', 1),
  (gen_random_uuid()::text, 'ccf71fadbd433fe3cc8c95f7bd9cf86bdf84e36175cdf6967a275bd469e03bcd', now(), '20261110070000_fixed_asset_gl_mappings', 1);

COMMIT;
