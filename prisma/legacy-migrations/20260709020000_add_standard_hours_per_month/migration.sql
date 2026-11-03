-- Payroll was estimating hourly rate as basic_salary / 160 with 160 baked
-- directly into app/api/hr/payroll/route.ts. Making it a company setting
-- (still defaulting to 160) so it's a real, adjustable value rather than a
-- silent hardcoded constant.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "standardHoursPerMonth" INTEGER DEFAULT 160;
UPDATE "companies" SET "standardHoursPerMonth" = 160 WHERE "standardHoursPerMonth" IS NULL;
