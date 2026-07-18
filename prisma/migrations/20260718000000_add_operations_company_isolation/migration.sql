-- Site, Incident, Equipment, Deployment, Patrol, CoverageRequest had no
-- companyId column at all -- a cross-tenant data-leak gap of the same class
-- already fixed for guards/finance tables. Add the column, backfill existing
-- rows to the oldest company (this project has a single real tenant with
-- data), then enforce FK + NOT NULL, matching the guards/companyId fix.

ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "patrols" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "coverage_requests" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

UPDATE "sites" SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "incidents" SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "equipment" SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "deployments" SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "patrols" SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

UPDATE "coverage_requests" SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_companyId_fkey') THEN
    ALTER TABLE "sites" ADD CONSTRAINT "sites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_companyId_fkey') THEN
    ALTER TABLE "incidents" ADD CONSTRAINT "incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_companyId_fkey') THEN
    ALTER TABLE "equipment" ADD CONSTRAINT "equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deployments_companyId_fkey') THEN
    ALTER TABLE "deployments" ADD CONSTRAINT "deployments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patrols_companyId_fkey') THEN
    ALTER TABLE "patrols" ADD CONSTRAINT "patrols_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coverage_requests_companyId_fkey') THEN
    ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sites_companyId_idx" ON "sites"("companyId");
CREATE INDEX IF NOT EXISTS "incidents_companyId_idx" ON "incidents"("companyId");
CREATE INDEX IF NOT EXISTS "equipment_companyId_idx" ON "equipment"("companyId");
CREATE INDEX IF NOT EXISTS "deployments_companyId_idx" ON "deployments"("companyId");
CREATE INDEX IF NOT EXISTS "patrols_companyId_idx" ON "patrols"("companyId");
CREATE INDEX IF NOT EXISTS "coverage_requests_companyId_idx" ON "coverage_requests"("companyId");

ALTER TABLE "sites" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "incidents" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "equipment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "deployments" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "patrols" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "coverage_requests" ALTER COLUMN "companyId" SET NOT NULL;
