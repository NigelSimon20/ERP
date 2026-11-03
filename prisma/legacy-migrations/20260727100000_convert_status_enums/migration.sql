-- Converts Guard.status and Site.status from free-text to real Postgres
-- enums, matching the actual Title-Case values already in use (Active/
-- Resigned/Terminated/Blacklisted for guards, Active/Terminated for sites).
--
-- SAFETY: run scripts/check-status-values.js then scripts/normalize-status-casing.js
-- BEFORE applying this file -- the ALTER COLUMN ... USING cast below will
-- fail (or, worse, silently succeed while dropping data) if a live row holds
-- a value outside these two enums' members.
DO $$ BEGIN
  CREATE TYPE "GuardStatus" AS ENUM ('Active', 'Resigned', 'Terminated', 'Blacklisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SiteStatus" AS ENUM ('Active', 'Terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "guards" ALTER COLUMN "status" TYPE "GuardStatus" USING "status"::"GuardStatus";
ALTER TABLE "sites" ALTER COLUMN "status" TYPE "SiteStatus" USING "status"::"SiteStatus";
