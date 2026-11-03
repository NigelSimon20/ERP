-- Vehicle fleet + Visitor register: the two named-in-brief Operations models
-- confirmed missing entirely (no schema, no API, no UI) during the Phase 4 audit.
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "registrationNumber" TEXT NOT NULL,
  "make" TEXT,
  "model" TEXT,
  "assignedSiteId" TEXT,
  "assignedGuardId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "vehicles_companyId_idx" ON "vehicles"("companyId");

CREATE TABLE IF NOT EXISTS "vehicle_inspections" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "inspectedBy" TEXT NOT NULL,
  "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "odometer" INTEGER,
  "fuelLevel" TEXT,
  "condition" TEXT NOT NULL,
  "defectsNoted" TEXT
);
CREATE INDEX IF NOT EXISTS "vehicle_inspections_companyId_idx" ON "vehicle_inspections"("companyId");
CREATE INDEX IF NOT EXISTS "vehicle_inspections_vehicleId_idx" ON "vehicle_inspections"("vehicleId");

CREATE TABLE IF NOT EXISTS "visitor_logs" (
  "id" TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "visitorName" TEXT NOT NULL,
  "idNumber" TEXT,
  "companyVisited" TEXT,
  "hostName" TEXT,
  "vehicleReg" TEXT,
  "checkIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkOut" TIMESTAMP(3),
  "badgeNumber" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "visitor_logs_companyId_idx" ON "visitor_logs"("companyId");
CREATE INDEX IF NOT EXISTS "visitor_logs_siteId_idx" ON "visitor_logs"("siteId");

DO $$ BEGIN
  ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "vehicle_inspections" ADD CONSTRAINT "vehicle_inspections_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
