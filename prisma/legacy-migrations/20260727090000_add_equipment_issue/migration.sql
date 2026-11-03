-- Equipment issue/return transactional ledger. Equipment.quantity_issued /
-- quantity_damaged / quantity_lost stay as denormalized counters (updated by
-- the new issue/return API endpoints), but who-has-what is now reconstructable
-- from real rows instead of a hand-edited number with no accountability trail.
CREATE TABLE IF NOT EXISTS "equipment_issues" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "guardId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "serialNumber" TEXT,
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedBy" TEXT NOT NULL,
  "returnedAt" TIMESTAMP(3),
  "returnedBy" TEXT,
  "returnCondition" TEXT,
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "equipment_issues_companyId_idx" ON "equipment_issues"("companyId");
CREATE INDEX IF NOT EXISTS "equipment_issues_equipmentId_idx" ON "equipment_issues"("equipmentId");
CREATE INDEX IF NOT EXISTS "equipment_issues_guardId_idx" ON "equipment_issues"("guardId");

DO $$ BEGIN
  ALTER TABLE "equipment_issues" ADD CONSTRAINT "equipment_issues_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "equipment_issues" ADD CONSTRAINT "equipment_issues_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "equipment_issues" ADD CONSTRAINT "equipment_issues_guardId_fkey"
    FOREIGN KEY ("guardId") REFERENCES "guards"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
