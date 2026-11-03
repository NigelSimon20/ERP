-- The Employee Accounts UI has always had a "Set as Primary?" selector and a
-- "Primary" badge, but the underlying column never existed -- every save
-- silently dropped the value. Adding it so the existing UI actually persists
-- and reads it.
ALTER TABLE "employee_accounts" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;
