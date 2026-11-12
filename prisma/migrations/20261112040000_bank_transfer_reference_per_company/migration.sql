-- Transfer references were unique across ALL tenants while numbering is
-- per company, so a second company's first transfer collided. Adds a
-- nullable companyId and makes the reference unique per company instead.
-- No row changes; only relaxes a constraint, so it cannot fail.
-- DropIndex
DROP INDEX "bank_transfers_reference_key";

-- AlterTable
ALTER TABLE "bank_transfers" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE INDEX "bank_transfers_companyId_idx" ON "bank_transfers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transfers_companyId_reference_key" ON "bank_transfers"("companyId", "reference");

