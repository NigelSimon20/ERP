-- Contract Revenue module: real contract entity (previously only a Site
-- billing-rate estimate existed, see app/api/dashboard/executive/route.ts).
DO $$ BEGIN
  CREATE TYPE "ContractStatus" AS ENUM ('DRAFT','ACTIVE','EXPIRED','TERMINATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "contracts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "customerId" TEXT,
  "siteId" TEXT,
  "quotationId" TEXT,
  "title" TEXT NOT NULL,
  "contractValue" DECIMAL(65,30) NOT NULL,
  "billingFrequency" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_contractNumber_key" ON "contracts"("contractNumber");
CREATE INDEX IF NOT EXISTS "contracts_companyId_idx" ON "contracts"("companyId");
CREATE INDEX IF NOT EXISTS "contracts_status_idx" ON "contracts"("status");

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "contract_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_contract_number" INTEGER DEFAULT 1;
