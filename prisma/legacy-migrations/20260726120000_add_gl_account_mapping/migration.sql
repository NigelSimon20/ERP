-- GL Account Mapping: explicit per-company Chart of Accounts links to
-- replace fuzzy account_name string-matching in lib/gl-posting.ts and
-- app/api/hr/payroll/route.ts. Mirrors the existing (already-present,
-- already-unused) vat_account_id column's own convention.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "receivables_account_id" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "payables_account_id" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "salaries_expense_account_id" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "payroll_liabilities_account_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_receivables_account_id_fkey"
    FOREIGN KEY ("receivables_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_payables_account_id_fkey"
    FOREIGN KEY ("payables_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_salaries_expense_account_id_fkey"
    FOREIGN KEY ("salaries_expense_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_payroll_liabilities_account_id_fkey"
    FOREIGN KEY ("payroll_liabilities_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
