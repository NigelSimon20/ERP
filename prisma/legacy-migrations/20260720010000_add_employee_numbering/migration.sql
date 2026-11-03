-- Employees were the only numbered entity without a dedicated Company
-- prefix + atomic counter pair (unlike invoices/customers/suppliers/sites),
-- which made nextEmployeeNumber() in lib/auto-numbers.ts guess the next
-- number by scanning the last Guard row — race-prone under concurrent hires.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "employee_code_prefix" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "next_employee_number" INTEGER DEFAULT 1;

-- Backfill: continue numbering from the highest existing employee_code per
-- company so existing employee codes aren't reissued to new hires. Mirrors
-- the trailing-digits extraction lib/auto-numbers.ts's parseNum() already uses.
UPDATE "companies" c
SET "next_employee_number" = COALESCE((
  SELECT MAX((regexp_match(g.employee_code, '(\d+)$'))[1]::int) + 1
  FROM "guards" g
  WHERE g."companyId" = c.id AND g.employee_code ~ '\d+$'
), 1);
