-- The payroll confirm step already generates a real reference number
-- (nextJournalReference) and shows it once on the success screen, but never
-- saves it -- the Past Payroll Runs list, the Payslips run filter, and the
-- printed Payslip PDF ("Pay Run: —") all permanently lose it.
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "reference" TEXT;
