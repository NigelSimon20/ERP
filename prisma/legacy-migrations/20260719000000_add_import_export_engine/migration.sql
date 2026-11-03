-- Centralized Import/Export engine (Phase 2 pilot: employees, customers,
-- suppliers, sites). Adds atomic per-company numbering counters for
-- Customer/Supplier/Site (mirroring the existing next_transfer_number /
-- next_force_number pattern -- these three had no counter at all before,
-- so no backfill UPDATE is needed, unlike the transfer-number fix) plus
-- the ImportJob/ImportJobRow tables that back the import wizard's
-- validation preview, commit, and rollback flow.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "customer_code_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_customer_number" INTEGER DEFAULT 1;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "supplier_code_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_supplier_number" INTEGER DEFAULT 1;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "site_code_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_site_number" INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS "import_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "fileRecordId" TEXT,
    "mode" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALIDATING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "import_job_rows" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "mappedData" JSONB NOT NULL,
    "classification" TEXT NOT NULL,
    "action" TEXT,
    "errors" JSONB,
    "recordId" TEXT,
    "previousData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_job_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "import_jobs_companyId_module_idx" ON "import_jobs"("companyId", "module");
CREATE INDEX IF NOT EXISTS "import_job_rows_importJobId_idx" ON "import_job_rows"("importJobId");

DO $$ BEGIN
  ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
