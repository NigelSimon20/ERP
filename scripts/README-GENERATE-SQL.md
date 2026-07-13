# generate-sql-from-backup

This script converts `db-backup/ravenshield_backup.json` into a SQL file `prisma/migrations/20260624000000_init/data_import.sql` ready to run in Supabase.

Usage

```bash
# from project root
npm install ts-node typescript @types/node --no-save
npx ts-node scripts/generate-sql-from-backup.ts
# then review prisma/migrations/20260624000000_init/data_import.sql
# to run the SQL file in Supabase, paste it into Supabase SQL editor or use psql
```

Notes
- The script uses `ON CONFLICT DO NOTHING` to avoid duplicate inserts on re-run.
- It writes inserts in an order intended to satisfy common foreign keys. Verify order before running in production.
