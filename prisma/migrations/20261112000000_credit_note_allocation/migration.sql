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

