-- HR approval-workflow backlog: Overtime Request, Expense Claim --
-- deferred from the Phase 4 document-suite plan as net-new business features.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "expense_claim_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_expense_claim_number" INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS "overtime_requests" (
  "id" TEXT PRIMARY KEY,
  "guardId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "hoursRequested" DOUBLE PRECISION NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedBy" TEXT,
  "rejectionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "overtime_requests_guardId_idx" ON "overtime_requests"("guardId");
CREATE INDEX IF NOT EXISTS "overtime_requests_companyId_idx" ON "overtime_requests"("companyId");
CREATE INDEX IF NOT EXISTS "overtime_requests_status_idx" ON "overtime_requests"("status");

CREATE TABLE IF NOT EXISTS "expense_claims" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "claimNumber" TEXT NOT NULL UNIQUE,
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "receiptFileId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approvedBy" TEXT,
  "rejectionNote" TEXT,
  "paidAt" TIMESTAMP(3),
  "journalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "expense_claims_companyId_idx" ON "expense_claims"("companyId");
CREATE INDEX IF NOT EXISTS "expense_claims_userId_idx" ON "expense_claims"("userId");
CREATE INDEX IF NOT EXISTS "expense_claims_status_idx" ON "expense_claims"("status");

DO $$ BEGIN
  ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "guards"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
