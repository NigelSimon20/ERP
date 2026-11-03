-- Link payslips back to the payroll run that generated them.
-- Previously payslips.created had no reference to payroll_runs, so the
-- finance payroll dashboard could not compute payslip counts per run
-- (it was hardcoded to 0). Nullable: pre-existing payslips predate this link.

ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "payroll_run_id" TEXT;
CREATE INDEX IF NOT EXISTS "payslips_payroll_run_id_idx" ON "payslips"("payroll_run_id");
