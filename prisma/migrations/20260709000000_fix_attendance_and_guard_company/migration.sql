-- The live "attendance" table was imported from a legacy system with a
-- completely different shape (a monthly per-employee timesheet rollup with
-- a JSON "daily_records" blob: total_days_worked, calculated_basic_pay,
-- daily_rate, etc.) than schema.prisma's Attendance model (one row per
-- guard per day: guardId, siteId, date, checkIn/out, hoursWorked, status).
-- No current app code reads the legacy columns by name -- every route
-- (operations/attendance, hr/payroll, all dashboards) is written against
-- the per-day model, so every one of those routes was crashing with
-- "column does not exist" (P2022). Preserve the legacy import data by
-- renaming it aside, then create a fresh table matching the real schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'daily_records'
  ) THEN
    ALTER TABLE "attendance" RENAME TO "legacy_attendance_import";
    -- Postgres does not rename a table's indexes/constraints when the table
    -- itself is renamed, so the old pkey index must be renamed explicitly or
    -- it collides with the new "attendance" table's own "attendance_pkey".
    ALTER TABLE "legacy_attendance_import" RENAME CONSTRAINT "attendance_pkey" TO "legacy_attendance_import_pkey";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "attendance" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_guardId_idx" ON "attendance"("guardId");
CREATE INDEX IF NOT EXISTS "attendance_siteId_idx" ON "attendance"("siteId");
CREATE INDEX IF NOT EXISTS "attendance_date_idx" ON "attendance"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_guardId_date_key" ON "attendance"("guardId", "date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_guardId_fkey') THEN
    ALTER TABLE "attendance"
      ADD CONSTRAINT "attendance_guardId_fkey"
      FOREIGN KEY ("guardId") REFERENCES "guards"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_siteId_fkey') THEN
    ALTER TABLE "attendance"
      ADD CONSTRAINT "attendance_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "sites"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- The live "guards" table also has no companyId column at all (a real
-- cross-tenant gap of the same class fixed for the finance tables earlier).
ALTER TABLE "guards" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

UPDATE "guards"
SET "companyId" = (SELECT "id" FROM "companies" ORDER BY "createdAt" LIMIT 1)
WHERE "companyId" IS NULL AND EXISTS (SELECT 1 FROM "companies");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guards_companyId_fkey') THEN
    ALTER TABLE "guards"
      ADD CONSTRAINT "guards_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "guards_companyId_idx" ON "guards"("companyId");

ALTER TABLE "guards" ALTER COLUMN "companyId" SET NOT NULL;
