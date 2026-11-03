-- Lock Dates UI has always collected a "Reason" textarea, but LockDate had
-- no column to store it in -- the value was silently discarded on save.
ALTER TABLE "lock_dates" ADD COLUMN IF NOT EXISTS "reason" TEXT;
