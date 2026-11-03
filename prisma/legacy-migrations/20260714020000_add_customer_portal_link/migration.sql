-- Links a User account to a Customer for the Client Portal, mirroring the
-- existing users.guardId -> guards.id pattern exactly (same nullable,
-- unique, one-to-one shape). Purely additive: one new nullable column +
-- index + FK on the existing "users" table, no data touched.
--
-- This is what makes app/api/portal/client/* actually able to scope data
-- to "this specific logged-in client" — before this, there was no schema
-- link between a CLIENT-role user and any Customer record at all.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_customerId_key" ON "users"("customerId");

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
