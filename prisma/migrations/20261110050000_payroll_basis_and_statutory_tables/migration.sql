-- P1-10. Additive: two columns and a new table.
ALTER TABLE "guards" ADD COLUMN "pay_basis" TEXT;
ALTER TABLE "companies" ADD COLUMN "default_pay_basis" TEXT NOT NULL DEFAULT 'DAILY';

CREATE TABLE "statutory_tables" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "config" JSONB NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statutory_tables_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "statutory_tables_companyId_kind_effectiveFrom_idx" ON "statutory_tables"("companyId", "kind", "effectiveFrom");
ALTER TABLE "statutory_tables" ENABLE ROW LEVEL SECURITY;
