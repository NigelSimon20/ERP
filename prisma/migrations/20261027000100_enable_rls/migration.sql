-- Supabase exposes the public schema through its REST API to anyone holding
-- the publishable (anon) key, which ships to the browser. Enabling RLS with no
-- policies denies that API access to every table. Prisma connects as the
-- table owner, which bypasses RLS, so the app is unaffected.
-- New tables do not inherit this: add `ENABLE ROW LEVEL SECURITY` for each
-- table created in a later migration.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
