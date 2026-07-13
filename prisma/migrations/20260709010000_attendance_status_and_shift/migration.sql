-- Rebuilding the Attendance module UI to match the legacy Base44 monthly
-- timesheet register, which uses a richer status legend (Present, Absent,
-- Sick, Leave, AWOL, Off, Induction Paid, Induction Unpaid, Relieved,
-- Transferred) plus a per-day Day/Night shift marker. The "attendance"
-- table is brand new and empty (created 2026-07-09), so this is a safe,
-- lossless enum/column change with no data to migrate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'AttendanceStatus' AND e.enumlabel = 'SICK'
  ) THEN
    ALTER TABLE "attendance" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "attendance" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
    DROP TYPE "AttendanceStatus";
    CREATE TYPE "AttendanceStatus" AS ENUM (
      'PRESENT', 'ABSENT', 'SICK', 'LEAVE', 'AWOL', 'OFF',
      'INDUCTION_PAID', 'INDUCTION_UNPAID', 'RELIEVED', 'TRANSFERRED'
    );
    ALTER TABLE "attendance" ALTER COLUMN "status" TYPE "AttendanceStatus" USING "status"::"AttendanceStatus";
    ALTER TABLE "attendance" ALTER COLUMN "status" SET DEFAULT 'PRESENT';
  END IF;
END $$;

ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "shift" "ShiftType";

-- siteId is now optional: the legacy grid doesn't require a site per
-- attendance mark, and no guard currently has an active Deployment row
-- (that table is also brand new/empty), so a NOT NULL siteId would block
-- every attendance entry until deployments are backfilled.
ALTER TABLE "attendance" ALTER COLUMN "siteId" DROP NOT NULL;
