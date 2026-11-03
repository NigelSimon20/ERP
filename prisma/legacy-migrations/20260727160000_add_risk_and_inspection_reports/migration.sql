-- Operations narrative-report backlog: Risk Assessment, Security Site Inspection --
-- deferred from the Phase 4 document-suite plan as net-new business features.
-- Modeled after the existing "incidents" table (no dedicated numbering, no GL impact).
CREATE TABLE IF NOT EXISTS "risk_assessments" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "assessedBy" TEXT NOT NULL,
  "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category" TEXT NOT NULL,
  "likelihood" TEXT NOT NULL,
  "impact" TEXT NOT NULL,
  "riskRating" TEXT NOT NULL,
  "findings" TEXT NOT NULL,
  "mitigationPlan" TEXT NOT NULL,
  "reviewDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "risk_assessments_companyId_idx" ON "risk_assessments"("companyId");
CREATE INDEX IF NOT EXISTS "risk_assessments_siteId_idx" ON "risk_assessments"("siteId");

CREATE TABLE IF NOT EXISTS "site_inspections" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "inspectedBy" TEXT NOT NULL,
  "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checklist" TEXT NOT NULL,
  "overallRating" TEXT NOT NULL,
  "findings" TEXT NOT NULL,
  "correctiveActions" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "site_inspections_companyId_idx" ON "site_inspections"("companyId");
CREATE INDEX IF NOT EXISTS "site_inspections_siteId_idx" ON "site_inspections"("siteId");

DO $$ BEGIN
  ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "site_inspections" ADD CONSTRAINT "site_inspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
