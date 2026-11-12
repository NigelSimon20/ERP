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

