-- Additive: a new table only.
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idempotency_keys_companyId_route_key_key" ON "idempotency_keys"("companyId", "route", "key");
-- Every public table needs RLS (see 20261027000100_enable_rls).
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
