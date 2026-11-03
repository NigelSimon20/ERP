-- Occurrence Book (Phase 3, first module). Purely additive: one new table,
-- no existing table or column touched.
--
-- Written by hand (not `prisma migrate dev`) because this environment has
-- no network route to the database; run this against the real database
-- (Supabase SQL editor, psql, or `prisma migrate deploy` from a machine
-- that can reach it) alongside the still-pending
-- 20260714000000_add_rbac_foundation migration + seed if that hasn't been
-- applied yet either.
--
-- No FK constraint on "siteId" here, matching the existing convention for
-- Incident.siteId elsewhere in this schema (a plain scalar reference, not
-- Prisma-relation-backed) -- consistent with how this codebase already
-- treats Site references.

CREATE TABLE IF NOT EXISTS "occurrence_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "entryType" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "linkedIncidentId" TEXT,
    "previousHash" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occurrence_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "occurrence_entries_siteId_sequenceNumber_key" ON "occurrence_entries"("siteId", "sequenceNumber");
CREATE INDEX IF NOT EXISTS "occurrence_entries_companyId_idx" ON "occurrence_entries"("companyId");
CREATE INDEX IF NOT EXISTS "occurrence_entries_siteId_idx" ON "occurrence_entries"("siteId");
CREATE INDEX IF NOT EXISTS "occurrence_entries_occurredAt_idx" ON "occurrence_entries"("occurredAt");
