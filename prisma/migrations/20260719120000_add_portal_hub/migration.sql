-- Enterprise External Portals Hub: adds Portal, PortalRoleAccess, and
-- PortalUsageLog tables. Written idempotently (IF NOT EXISTS / duplicate_object
-- guards) per this project's established pattern -- prisma migrate/push hangs
-- against the Supabase transaction-pooler connection this project uses, so
-- schema changes are applied as raw SQL via a one-off pg script instead.

DO $$ BEGIN
  CREATE TYPE "PortalCategory" AS ENUM ('INTERNAL', 'EXTERNAL', 'GOVERNMENT', 'BANKING', 'TELECOMMUNICATIONS', 'UTILITIES', 'HR', 'FINANCE', 'OPERATIONS', 'COMPLIANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PortalOpenBehavior" AS ENUM ('NEW_TAB', 'SAME_TAB', 'EMBEDDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "portals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PortalCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "logoUrl" TEXT,
    "icon" TEXT,
    "colorPrimary" TEXT,
    "colorSecondary" TEXT,
    "buttonText" TEXT NOT NULL DEFAULT 'Open Portal',
    "openBehavior" "PortalOpenBehavior" NOT NULL DEFAULT 'NEW_TAB',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "supportContact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "portal_role_access" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "portal_role_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "portal_usage_logs" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'LAUNCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "portals_companyId_idx" ON "portals"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "portals_companyId_slug_key" ON "portals"("companyId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "portal_role_access_portalId_role_key" ON "portal_role_access"("portalId", "role");
CREATE INDEX IF NOT EXISTS "portal_usage_logs_portalId_idx" ON "portal_usage_logs"("portalId");
CREATE INDEX IF NOT EXISTS "portal_usage_logs_userId_idx" ON "portal_usage_logs"("userId");

DO $$ BEGIN
  ALTER TABLE "portals" ADD CONSTRAINT "portals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "portal_role_access" ADD CONSTRAINT "portal_role_access_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "portals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "portal_usage_logs" ADD CONSTRAINT "portal_usage_logs_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "portals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "portal_usage_logs" ADD CONSTRAINT "portal_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
