-- The procurement, sales-document, HR-workflow and risk/inspection migrations
-- created their "status" columns as TEXT, but schema.prisma declares them as
-- Postgres enums. Prisma casts enum params to e.g. "public"."PurchaseOrderStatus"
-- on write, so every create against these tables failed with 42704
-- (type does not exist). This creates the six missing types and converts the
-- columns. Prisma writes to these tables always failed, so live rows (if any)
-- can only hold the column defaults; UPPER() guards against stray casing.

DO $$ BEGIN
  CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ProformaStatus" AS ENUM ('DRAFT', 'SENT', 'CONVERTED', 'EXPIRED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "DebitNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ExpenseClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FINAL', 'REVIEWED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "status" TYPE "PurchaseOrderStatus" USING UPPER("status")::"PurchaseOrderStatus";
ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "proforma_invoices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "proforma_invoices" ALTER COLUMN "status" TYPE "ProformaStatus" USING UPPER("status")::"ProformaStatus";
ALTER TABLE "proforma_invoices" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "credit_notes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "credit_notes" ALTER COLUMN "status" TYPE "CreditNoteStatus" USING UPPER("status")::"CreditNoteStatus";
ALTER TABLE "credit_notes" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "debit_notes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "debit_notes" ALTER COLUMN "status" TYPE "DebitNoteStatus" USING UPPER("status")::"DebitNoteStatus";
ALTER TABLE "debit_notes" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "expense_claims" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "expense_claims" ALTER COLUMN "status" TYPE "ExpenseClaimStatus" USING UPPER("status")::"ExpenseClaimStatus";
ALTER TABLE "expense_claims" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "risk_assessments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "risk_assessments" ALTER COLUMN "status" TYPE "ReportStatus" USING UPPER("status")::"ReportStatus";
ALTER TABLE "risk_assessments" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "site_inspections" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "site_inspections" ALTER COLUMN "status" TYPE "ReportStatus" USING UPPER("status")::"ReportStatus";
ALTER TABLE "site_inspections" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
