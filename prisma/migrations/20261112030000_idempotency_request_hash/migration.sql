-- A7. Additive: a nullable column and two indexes.
-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN     "requestHash" TEXT;

-- CreateIndex
CREATE INDEX "idempotency_keys_companyId_key_idx" ON "idempotency_keys"("companyId", "key");

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

