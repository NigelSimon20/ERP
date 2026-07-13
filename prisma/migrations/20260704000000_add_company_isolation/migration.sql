-- Phase 5: Add Company Isolation to Customer, Supplier, and Payment tables
-- This migration adds multi-company data isolation for financial tables
-- It is safe to run repeatedly and will skip changes that already exist.

-- Step 1: Ensure the companyId columns exist
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- Step 2: Backfill existing rows to the first company when needed
UPDATE "customers"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "suppliers"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "payments"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

-- Step 3: Add foreign key constraints only if they do not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_companyId_fkey') THEN
    ALTER TABLE "customers"
      ADD CONSTRAINT "customers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_companyId_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_companyId_fkey') THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 4: Add indexes for query performance if they do not already exist
CREATE INDEX IF NOT EXISTS "customers_companyId_idx" ON "customers"("companyId");
CREATE INDEX IF NOT EXISTS "suppliers_companyId_idx" ON "suppliers"("companyId");
CREATE INDEX IF NOT EXISTS "payments_companyId_idx" ON "payments"("companyId");
