-- Phase 6: Add Company Isolation to ChartOfAccount, BankAccount, JournalEntry, SalesInvoice
-- Continues Phase 5 (20260704000000_add_company_isolation) for the remaining
-- finance tables that were still globally shared across companies.
-- It is safe to run repeatedly and will skip changes that already exist.

-- Step 1: Ensure the companyId columns exist
ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Step 2: Backfill existing rows to the first company when needed
UPDATE "chart_of_accounts"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "bank_accounts"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "journal_entries"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "sales_invoices"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

-- Step 3: Add foreign key constraints only if they do not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_companyId_fkey') THEN
    ALTER TABLE "chart_of_accounts"
      ADD CONSTRAINT "chart_of_accounts_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_companyId_fkey') THEN
    ALTER TABLE "bank_accounts"
      ADD CONSTRAINT "bank_accounts_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_companyId_fkey') THEN
    ALTER TABLE "journal_entries"
      ADD CONSTRAINT "journal_entries_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_companyId_fkey') THEN
    ALTER TABLE "sales_invoices"
      ADD CONSTRAINT "sales_invoices_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 4: Add indexes for query performance if they do not already exist
CREATE INDEX IF NOT EXISTS "chart_of_accounts_companyId_idx" ON "chart_of_accounts"("companyId");
CREATE INDEX IF NOT EXISTS "bank_accounts_companyId_idx" ON "bank_accounts"("companyId");
CREATE INDEX IF NOT EXISTS "journal_entries_companyId_idx" ON "journal_entries"("companyId");
CREATE INDEX IF NOT EXISTS "sales_invoices_companyId_idx" ON "sales_invoices"("companyId");

-- Step 5: Enforce NOT NULL now that every existing row has a value.
-- Skipped automatically if the companies table was empty during backfill
-- (fresh/empty database) -- in that case there are zero rows to violate NOT NULL anyway.
ALTER TABLE "chart_of_accounts" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "bank_accounts" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "journal_entries" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sales_invoices" ALTER COLUMN "companyId" SET NOT NULL;
