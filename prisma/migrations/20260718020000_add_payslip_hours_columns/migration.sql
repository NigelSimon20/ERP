-- The payroll "confirm" step computes hoursWorked/overtimeHours/overtimePay
-- per guard (from Attendance) but never persisted them onto the Payslip row,
-- so the payslip detail page could never show real hours/overtime once a
-- run was confirmed. Add columns to actually keep this data going forward.
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "hours_worked" DOUBLE PRECISION;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "overtime_hours" DOUBLE PRECISION;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "overtime_pay" DOUBLE PRECISION;
