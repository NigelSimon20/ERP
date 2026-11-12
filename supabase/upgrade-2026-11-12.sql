-- RavenShield upgrade for the remaining-fixes release (A1-A9).
-- Run AFTER supabase/upgrade-2026-11-10.sql. Paste the whole file into
-- Supabase -> SQL Editor and click Run, once. All or nothing.
--
-- Every change adds columns, tables or indexes; no existing value changes.
-- One exception in kind: bank transfer references become unique per company
-- (the global unique index is replaced; no rows change).

BEGIN;

-- ===== 20261112000000_credit_note_allocation
-- A2. Additive: new columns with defaults; no existing value changes.
-- Existing issued credit/debit notes keep allocatedAmount 0, i.e. they stay
-- unapplied credit, exactly how the subledger already counted them.
-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "allow_unapplied_credit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "credit_notes" ADD COLUMN     "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "debit_notes" ADD COLUMN     "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "creditedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN     "credited_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;


-- ===== 20261112010000_payroll_approval
-- A3. Additive: one enum value, nullable columns and columns with defaults.
-- Existing runs keep their status (PAID runs stay PAID).
-- AlterEnum
ALTER TYPE "PayrollStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "net_pay_payable_account_id" TEXT,
ADD COLUMN     "payroll_require_second_approver" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "approvalJournalId" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidBy" TEXT,
ADD COLUMN     "paymentJournalId" TEXT,
ADD COLUMN     "totalEmployerContributions" DECIMAL(18,2) NOT NULL DEFAULT 0;


-- ===== 20261112020000_statutory_effective_to
-- A3. Additive: nullable column.
-- AlterTable
ALTER TABLE "statutory_tables" ADD COLUMN     "effectiveTo" TIMESTAMP(3);


-- ===== 20261112030000_idempotency_request_hash
-- A7. Additive: a nullable column and two indexes.
-- AlterTable
ALTER TABLE "idempotency_keys" ADD COLUMN     "requestHash" TEXT;

-- CreateIndex
CREATE INDEX "idempotency_keys_companyId_key_idx" ON "idempotency_keys"("companyId", "key");

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");


-- ===== 20261112040000_bank_transfer_reference_per_company
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


INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES
  (gen_random_uuid()::text, 'ad4102f4efec5315fd08d5363ed6ea7c120a69bc3bd1bb28a024401a1af294b4', now(), '20261112000000_credit_note_allocation', 1),
  (gen_random_uuid()::text, 'c1feca8feeacfb05c20362a81472b17d027cc3932f721b266b12245909b1a5cf', now(), '20261112010000_payroll_approval', 1),
  (gen_random_uuid()::text, 'af4ab92d87efe52657dd2828455636b541a90111054ed14b2c502b1541b775ac', now(), '20261112020000_statutory_effective_to', 1),
  (gen_random_uuid()::text, '44c4347ba6f629b060abfb1864de9db95517fe4a48ac0452381099450ab8f95f', now(), '20261112030000_idempotency_request_hash', 1),
  (gen_random_uuid()::text, '2c7c3079cfe2ae362c7a00f29245c1595c371bf5bc0c83aabf0537159012135a', now(), '20261112040000_bank_transfer_reference_per_company', 1);

COMMIT;
